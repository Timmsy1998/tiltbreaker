import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { dirname, extname, join } from "node:path";
import { promisify } from "node:util";

interface LockfileConnection {
  name: string;
  password: string;
  port: number;
  protocol: string;
  pid: number;
  path?: string;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

const execFileAsync = promisify(execFile);

export class LcuClient {
  private connection?: LockfileConnection;
  private preferredLockfilePath?: string;

  setPreferredLockfilePath(lockfilePath?: string) {
    this.preferredLockfilePath = lockfilePath;
    this.connection = undefined;
  }

  get lockfilePath() {
    return this.connection?.path ?? this.preferredLockfilePath;
  }

  async connect() {
    const lockfilePath = await this.findLockfile();
    if (!lockfilePath) {
      this.connection = undefined;
      return undefined;
    }

    const raw = readFileSync(lockfilePath, "utf8").trim();
    const [name, pid, port, password, protocol] = raw.split(":");

    if (!name || !pid || !port || !password || !protocol) {
      throw new Error("LCU lockfile was found but could not be parsed.");
    }

    this.connection = {
      name,
      password,
      port: Number(port),
      protocol,
      pid: Number(pid),
      path: lockfilePath
    };

    return this.connection;
  }

  async requestJson<T>(endpoint: string, options: RequestOptions = {}) {
    const result = await this.request(endpoint, {
      ...options,
      responseType: "json"
    });

    return result as T;
  }

  async requestBuffer(endpoint: string) {
    return this.request(endpoint, {
      method: "GET",
      responseType: "buffer"
    }) as Promise<{ buffer: Buffer; contentType: string }>;
  }

  private async request(
    endpoint: string,
    options: RequestOptions & { responseType: "json" | "buffer" }
  ) {
    const connection = this.connection ?? (await this.connect());

    if (!connection) {
      throw new Error("League Client is not running.");
    }

    const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const auth = Buffer.from(`riot:${connection.password}`).toString("base64");

    return new Promise((resolve, reject) => {
      const req = httpsRequest(
        {
          hostname: "127.0.0.1",
          port: connection.port,
          path,
          method: options.method ?? "GET",
          rejectUnauthorized: false,
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "*/*",
            ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
            ...options.headers
          }
        },
        (res) => {
          const chunks: Buffer[] = [];

          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const buffer = Buffer.concat(chunks);

            if ((res.statusCode ?? 500) >= 400) {
              reject(new Error(`LCU ${res.statusCode}: ${buffer.toString("utf8")}`));
              return;
            }

            if (options.responseType === "buffer") {
              resolve({
                buffer,
                contentType: res.headers["content-type"] ?? "application/octet-stream"
              });
              return;
            }

            if (!buffer.length) {
              resolve(undefined);
              return;
            }

            try {
              resolve(JSON.parse(buffer.toString("utf8")));
            } catch {
              resolve(buffer.toString("utf8"));
            }
          });
        }
      );

      req.on("error", (error) => {
        this.connection = undefined;
        reject(error);
      });

      if (body) {
        req.write(body);
      }

      req.end();
    });
  }

  private async findLockfile() {
    const candidates = [
      this.preferredLockfilePath,
      process.env.LEAGUE_LOCKFILE,
      process.env.RIOT_CLIENT_INSTALL_PATH ? join(process.env.RIOT_CLIENT_INSTALL_PATH, "lockfile") : undefined,
      process.env.ProgramData ? join(process.env.ProgramData, "Riot Games", "RiotClientInstalls.json") : undefined,
      "C:\\Riot Games\\League of Legends\\lockfile",
      "C:\\Program Files\\Riot Games\\League of Legends\\lockfile",
      "C:\\Program Files (x86)\\Riot Games\\League of Legends\\lockfile"
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      if (candidate.endsWith("RiotClientInstalls.json")) {
        const discovered = this.readInstallConfig(candidate);

        if (discovered) {
          return discovered;
        }

        continue;
      }

      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return this.findLockfileFromProcess();
  }

  private readInstallConfig(configPath: string) {
    if (!existsSync(configPath)) {
      return undefined;
    }

    try {
      const config = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, string>;
      const installPath =
        config.lol ?? config.league_of_legends ?? config["league-of-legends"] ?? config.LEAGUE_OF_LEGENDS;

      if (!installPath) {
        return undefined;
      }

      const leagueDirectory = extname(installPath) ? dirname(installPath) : installPath;
      const lockfilePath = join(leagueDirectory, "lockfile");
      return existsSync(lockfilePath) ? lockfilePath : undefined;
    } catch {
      return undefined;
    }
  }

  private async findLockfileFromProcess() {
    if (process.platform !== "win32") {
      return undefined;
    }

    try {
      const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -First 1 -ExpandProperty CommandLine)"
      ]);

      const commandLine = stdout.trim();
      const installDirectory =
        commandLine.match(/--install-directory="?([^"]+?)"?(?:\s+--|$)/)?.[1] ??
        commandLine.match(/--install-directory=([^\s]+)/)?.[1];

      if (!installDirectory) {
        return undefined;
      }

      const lockfilePath = join(installDirectory, "lockfile");
      return existsSync(lockfilePath) ? lockfilePath : undefined;
    } catch {
      return undefined;
    }
  }
}
