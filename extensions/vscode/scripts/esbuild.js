const esbuild = require("esbuild");
const path = require("path");

const flags = process.argv.slice(2);

const esbuildConfig = {
	entryPoints: ["src/extension.ts"],
	bundle: true,
	outfile: "out/extension.js",
	external: ["vscode", "esbuild", "./xhr-sync-worker.js"],
	format: "cjs",
	platform: "node",
	sourcemap: flags.includes("--sourcemap"),
	loader: {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		".node": "file",
	},
	// Add path resolution for core modules
	alias: {
		"core": path.resolve(__dirname, "../../../core"),
	},
	// To allow import.meta.path for transformers.js
	// https://github.com/evanw/esbuild/issues/1492#issuecomment-893144483
	inject: ["./scripts/importMetaUrl.js"],
	define: { "import.meta.url": "importMetaUrl" },
};

(async () => {
	// Bundles the extension into one file
	if (flags.includes("--watch")) {
		const ctx = await esbuild.context(esbuildConfig);
		await ctx.watch();
	} else {
		await esbuild.build(esbuildConfig);

		// BEGIN SQLITE3 AND XHR WORKER COPY
		const fs = require("fs");
		const fspath = require("path");
		try {
			// sqlite binding
			const srcBinding = fspath.resolve(__dirname, "../node_modules/sqlite3/build/Release/node_sqlite3.node");
			const destBinding = fspath.resolve(__dirname, "../out/build/Release/node_sqlite3.node");
			if (fs.existsSync(srcBinding)) {
				fs.mkdirSync(fspath.dirname(destBinding), { recursive: true });
				fs.copyFileSync(srcBinding, destBinding);
				console.log("[esbuild] Copied sqlite3 native binding to", destBinding);
			} else {
				console.warn("[esbuild] sqlite3 native binding not found at", srcBinding);
			}

			// xhr-sync-worker
			const srcWorker = fspath.resolve(__dirname, "../node_modules/jsdom/lib/jsdom/living/xhr/xhr-sync-worker.js");
			const destWorker = fspath.resolve(__dirname, "../out/xhr-sync-worker.js");
			if (fs.existsSync(srcWorker)) {
				fs.copyFileSync(srcWorker, destWorker);
				console.log("[esbuild] Copied xhr-sync-worker to", destWorker);
			} else {
				console.warn("[esbuild] xhr-sync-worker.js not found at", srcWorker);
			}
		} catch (err) {
			console.warn("[esbuild] Failed to copy native/worker files:", err.message);
		}
		// END SQLITE3 AND XHR WORKER COPY
	}
})();
