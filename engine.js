export class Engine {
  constructor() {
    this.worker = null;
    this.pending = null;
    this.ready = null;
    this.tail = Promise.resolve();
  }

  reset(error = new Error("Engine stopped")) {
    this.pending?.reject(error);
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }

  send(command) {
    this.worker.postMessage(command);
  }

  receive(data) {
    for (const line of String(data).split(/\r?\n/)) {
      this.pending?.accept(line.trim());
    }
  }

  wait(command, predicate, onLine = () => {}, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.reset(new Error("Engine timed out. Use retry to restart it."));
      }, timeout);

      const finish = (error, result) => {
        clearTimeout(timer);
        this.pending = null;
        if (error) reject(error);
        else resolve(result);
      };

      this.pending = {
        reject: error => finish(error),
        accept: line => {
          onLine(line);
          if (predicate(line)) finish(null, line);
        },
      };
      this.send(command);
    });
  }

  init() {
    if (this.ready) return this.ready;

    this.ready = (async () => {
      this.worker = new Worker(
        new URL("./vendor/stockfish-19-lite-single.js", import.meta.url)
      );
      this.worker.onmessage = event => this.receive(event.data);
      this.worker.onerror = () => {
        this.reset(new Error(
          "Stockfish could not load. Run setup.py and serve this directory."
        ));
      };

      await this.wait("uci", line => line === "uciok");
      this.send("setoption name Hash value 32");
      await this.wait("isready", line => line === "readyok");
    })().catch(error => {
      this.reset(error);
      throw error;
    });

    return this.ready;
  }

  analyze(moves = [], onlyMove = null, skill = 10) {
    const run = async () => {
      await this.init();
      const variations = new Map();

      this.send(`setoption name Skill Level value ${skill}`);
      await this.wait("isready", line => line === "readyok");
      this.send(`setoption name MultiPV value ${onlyMove ? 1 : 2}`);
      this.send(
        "position startpos" +
        (moves.length ? ` moves ${moves.join(" ")}` : "")
      );

      let command = "go depth 14 movetime 1400";
      if (onlyMove) command += ` searchmoves ${onlyMove}`;

      const final = await this.wait(
        command,
        line => line.startsWith("bestmove "),
        line => {
          if (!line.startsWith("info ")) return;
          if (/\b(lowerbound|upperbound)\b/.test(line)) return;

          const score = line.match(/\bscore (cp|mate) (-?\d+)/);
          const pv = line.match(/\bpv (.+)$/);
          if (!score || !pv) return;

          const rank = Number(line.match(/\bmultipv (\d+)/)?.[1] || 1);
          const depth = Number(line.match(/\bdepth (\d+)/)?.[1] || 0);
          variations.set(rank, {
            kind: score[1],
            value: Number(score[2]),
            depth,
            pv: pv[1].trim().split(/\s+/),
          });
        }
      );

      const best = final.split(/\s+/)[1];
      const first = variations.get(1);
      if (!first || !best || best === "(none)" || best === "0000") {
        throw new Error("No usable engine analysis was returned.");
      }

      return {
        ...first,
        best,
        second: variations.get(2) || null,
      };
    };

    const job = this.tail.then(run);
    this.tail = job.catch(() => {});
    return job;
  }
}
