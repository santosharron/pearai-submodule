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
	}
})();
