const fs = require("fs");
const ncp = require("ncp").ncp;
const path = require("path");
const { rimrafSync } = require("rimraf");
const {
  validateFilesPresent,
  execCmdSync,
  autodetectPlatformAndArch,
} = require("../../../scripts/util/index");

// Clear folders that will be packaged to ensure clean slate
rimrafSync(path.join(__dirname, "..", "bin"));
rimrafSync(path.join(__dirname, "..", "out"));
fs.mkdirSync(path.join(__dirname, "..", "out", "node_modules"), {
  recursive: true,
});
const guiDist = path.join(__dirname, "..", "..", "..", "gui", "dist");
if (!fs.existsSync(guiDist)) {
  fs.mkdirSync(guiDist, { recursive: true });
}

// Get the target to package for
let target = undefined;
const args = process.argv;
if (args[2] === "--target") {
  target = args[3];
}

let os;
let arch;
if (!target) {
  [os, arch] = autodetectPlatformAndArch();
} else {
  [os, arch] = target.split("-");
}

if (os === "alpine") {
  os = "linux";
}
if (arch === "armhf") {
  arch = "arm64";
}
target = `${os}-${arch}`;
console.log("[info] Using target: ", target);

const exe = os === "win32" ? ".exe" : "";

(async () => {
  console.log("[info] Packaging extension for target ", target);

  // Copy config_schema.json to config.json in docs and intellij
  fs.copyFileSync(
    "config_schema.json",
    path.join("..", "..", "docs", "static", "schemas", "config.json"),
  );
  fs.copyFileSync(
    "config_schema.json",
    path.join(
      "..",
      "intellij",
      "src",
      "main",
      "resources",
      "config_schema.json",
    ),
  );
  // Modify and copy for .pearairc.json
  const schema = JSON.parse(fs.readFileSync("config_schema.json", "utf8"));
  schema.definitions.SerializedContinueConfig.properties.mergeBehavior = {
    type: "string",
    enum: ["merge", "overwrite"],
    default: "merge",
    title: "Merge behavior",
    markdownDescription:
      "If set to 'merge', .pearairc.json will be applied on top of config.json (arrays and objects are merged). If set to 'overwrite', then every top-level property of .pearairc.json will overwrite that property from config.json.",
  };
  fs.writeFileSync("continue_rc_schema.json", JSON.stringify(schema, null, 2));

  if (!process.cwd().endsWith("vscode")) {
    // This is sometimes run from root dir instead (e.g. in VS Code tasks)
    process.chdir("extensions/vscode");
  }

  // Install node_modules //
  execCmdSync("npm install");
  console.log("[info] npm install in extensions/vscode completed");

  process.chdir("../../gui");

  execCmdSync("npm install");
  console.log("[info] npm install in gui completed");

  if (ghAction()) {
    execCmdSync("npm run build");
  }

  // Copy over the dist folder to the Intellij extension //
  const intellijExtensionWebviewPath = path.join(
    "..",
    "extensions",
    "intellij",
    "src",
    "main",
    "resources",
    "webview",
  );

  const indexHtmlPath = path.join(intellijExtensionWebviewPath, "index.html");
  fs.copyFileSync(indexHtmlPath, "tmp_index.html");
  rimrafSync(intellijExtensionWebviewPath);
  fs.mkdirSync(intellijExtensionWebviewPath, { recursive: true });

  await new Promise((resolve, reject) => {
    ncp("dist", intellijExtensionWebviewPath, (error) => {
      if (error) {
        console.warn(
          "[error] Error copying React app build to Intellij extension: ",
          error,
        );
        reject(error);
      }
      resolve();
    });
  });

  // Put back index.html
  if (fs.existsSync(indexHtmlPath)) {
    rimrafSync(indexHtmlPath);
  }
  fs.copyFileSync("tmp_index.html", indexHtmlPath);
  fs.unlinkSync("tmp_index.html");

  // Copy over other misc. files
  fs.copyFileSync(
    "../extensions/vscode/gui/onigasm.wasm",
    path.join(intellijExtensionWebviewPath, "onigasm.wasm"),
  );

  console.log("[info] Copied gui build to Intellij extension");

  // Then copy over the dist folder to the VSCode extension //
  const vscodeGuiPath = path.join("../extensions/vscode/gui");
  fs.mkdirSync(vscodeGuiPath, { recursive: true });
  await new Promise((resolve, reject) => {
    ncp("dist", vscodeGuiPath, (error) => {
      if (error) {
        console.log(
          "Error copying React app build to VSCode extension: ",
          error,
        );
        reject(error);
      } else {
        console.log("Copied gui build to VSCode extension");
        resolve();
      }
    });
  });

  if (!fs.existsSync(path.join("dist", "assets", "index.js"))) {
    throw new Error("gui build did not produce index.js");
  }
  if (!fs.existsSync(path.join("dist", "assets", "index.css"))) {
    throw new Error("gui build did not produce index.css");
  }

  // Copy over native / wasm modules //
  process.chdir("../extensions/vscode");

  fs.mkdirSync("bin", { recursive: true });

  // onnxruntime-node
  await new Promise((resolve, reject) => {
    ncp(
      path.join(__dirname, "../../../core/node_modules/onnxruntime-node/bin"),
      path.join(__dirname, "../bin"),
      {
        dereference: true,
      },
      (error) => {
        if (error) {
          console.warn("[info] Error copying onnxruntime-node files", error);
          reject(error);
        }
        resolve();
      },
    );
  });
  if (target) {
    // If building for production, only need the binaries for current platform
    try {
      if (!target.startsWith("darwin")) {
        rimrafSync(path.join(__dirname, "../bin/napi-v3/darwin"));
      }
      if (!target.startsWith("linux")) {
        rimrafSync(path.join(__dirname, "../bin/napi-v3/linux"));
      }
      if (!target.startsWith("win")) {
        rimrafSync(path.join(__dirname, "../bin/napi-v3/win32"));
      }

      // Also don't want to include cuda/shared/tensorrt binaries, they are too large
      if (target.startsWith("linux")) {
        const filesToRemove = [
          "libonnxruntime_providers_cuda.so",
          "libonnxruntime_providers_shared.so",
          "libonnxruntime_providers_tensorrt.so",
        ];
        filesToRemove.forEach((file) => {
          const filepath = path.join(
            __dirname,
            "../bin/napi-v3/linux/x64",
            file,
          );
          if (fs.existsSync(filepath)) {
            fs.rmSync(filepath);
          }
        });
      }
    } catch (e) {
      console.warn("[info] Error removing unused binaries", e);
    }
  }
  console.log("[info] Copied onnxruntime-node");

  // tree-sitter-wasm
  fs.mkdirSync("out", { recursive: true });

  await new Promise((resolve, reject) => {
    ncp(
      path.join(__dirname, "../../../core/node_modules/tree-sitter-wasms/out"),
      path.join(__dirname, "../out/tree-sitter-wasms"),
      { dereference: true },
      (error) => {
        if (error) {
          console.warn("[error] Error copying tree-sitter-wasm files", error);
          reject(error);
        } else {
          resolve();
        }
      },
    );
  });

  const filesToCopy = [
    "../../../core/vendor/tree-sitter.wasm",
    "../../../core/llm/llamaTokenizerWorkerPool.mjs",
    "../../../core/llm/llamaTokenizer.mjs",
  ];
  for (const f of filesToCopy) {
    fs.copyFileSync(path.join(__dirname, f), path.join(__dirname, "..", "out", path.basename(f)));
    console.log(`[info] Copied ${path.basename(f)}`);
  }

  // tree-sitter tag query files
  // ncp(
  //   path.join(
  //     __dirname,
  //     "../../../core/node_modules/llm-code-highlighter/dist/tag-qry",
  //   ),
  //   path.join(__dirname, "../out/tag-qry"),
  //   (error) => {
  //     if (error)
  //       console.warn("Error copying code-highlighter tag-qry files", error);
  //   },
  // );

  // textmate-syntaxes
  await new Promise((resolve, reject) => {
    ncp(
      path.join(__dirname, "../textmate-syntaxes"),
      path.join(__dirname, "../gui/textmate-syntaxes"),
      (error) => {
        if (error) {
          console.warn("[error] Error copying textmate-syntaxes", error);
          reject(error);
        } else {
          resolve();
        }
      },
    );
  });

  function ghAction() {
    return !!process.env.GITHUB_ACTIONS;
  }

  function isArm() {
    return (
      target === "darwin-arm64" ||
      target === "linux-arm64" ||
      target === "win32-arm64"
    );
  }

  function isWin() {
    return target?.startsWith("win");
  }

  async function installNodeModuleInTempDirAndCopyToCurrent(
    packageName,
    toCopy,
  ) {
    console.log(`Copying ${packageName} to ${toCopy}`);
    // This is a way to install only one package without npm trying to install all the dependencies
    // Create a temporary directory for installing the package
    const adjustedName = packageName.replace(/@/g, "").replace("/", "-");

    const tempDir = `/tmp/continue-node_modules-${adjustedName}`;
    const currentDir = process.cwd();

    // Remove the dir we will be copying to
    rimrafSync(`node_modules/${toCopy}`);

    // Ensure the temporary directory exists
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Move to the temporary directory
      process.chdir(tempDir);

      // Initialize a new package.json and install the package
      execCmdSync(`npm init -y && npm i -f ${packageName} --no-save`);

      console.log(
        `Contents of: ${packageName}`,
        fs.readdirSync(path.join(tempDir, "node_modules", toCopy)),
      );

      // Without this it seems the file isn't completely written to disk
      // Ideally we validate file integrity in the validation at the end
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Copy the installed package back to the current directory
      await new Promise((resolve, reject) => {
        ncp(
          path.join(tempDir, "node_modules", toCopy),
          path.join(currentDir, "node_modules", toCopy),
          { dereference: true },
          (error) => {
            if (error) {
              console.error(
                `[error] Error copying ${packageName} package`,
                error,
              );
              reject(error);
            } else {
              resolve();
            }
          },
        );
      });
    } finally {
      // Clean up the temporary directory
      // rimrafSync(tempDir);

      // Return to the original directory
      process.chdir(currentDir);
    }
  }

  // GitHub Actions doesn't support ARM, so we need to download pre-saved binaries
  if (ghAction() && isArm()) {
    // sqlite3
    if (!isWin()) {
      // Neither lancedb nor sqlite3 have pre-built windows arm64 binaries

      // lancedb binary
      const packageToInstall = {
        "darwin-arm64": "@lancedb/vectordb-darwin-arm64",
        "linux-arm64": "@lancedb/vectordb-linux-arm64-gnu",
      }[target];
      console.log(
        "[info] Downloading pre-built lancedb binary: " + packageToInstall,
      );

      await installNodeModuleInTempDirAndCopyToCurrent(
        packageToInstall,
        "@lancedb",
      );

      // Replace the installed with pre-built
      console.log("[info] Downloading pre-built sqlite3 binary");
      rimrafSync("../../core/node_modules/sqlite3/build");
      const downloadUrl = {
        "darwin-arm64":
          "https://github.com/TryGhost/node-sqlite3/releases/download/v5.1.7/sqlite3-v5.1.7-napi-v6-darwin-arm64.tar.gz",
        "linux-arm64":
          "https://github.com/TryGhost/node-sqlite3/releases/download/v5.1.7/sqlite3-v5.1.7-napi-v3-linux-arm64.tar.gz",
      }[target];
      execCmdSync(
        `curl -L -o ../../core/node_modules/sqlite3/build.tar.gz ${downloadUrl}`,
      );
      execCmdSync(
        "cd ../../core/node_modules/sqlite3 && tar -xvzf build.tar.gz",
      );
      fs.unlinkSync("../../core/node_modules/sqlite3/build.tar.gz");
    }

    // Download and unzip esbuild
    console.log("[info] Downloading pre-built esbuild binary");
    rimrafSync("node_modules/@esbuild");
    fs.mkdirSync("node_modules/@esbuild", { recursive: true });
    execCmdSync(
      `curl -o node_modules/@esbuild/esbuild.zip https://continue-server-binaries.s3.us-west-1.amazonaws.com/${target}/esbuild.zip`,
    );
    execCmdSync(`cd node_modules/@esbuild && unzip esbuild.zip`);
    fs.unlinkSync("node_modules/@esbuild/esbuild.zip");
  } else {
    const esbuildPath = path.join("node_modules", "esbuild", "package.json");
    let isCorrectVersion = false;

    if (fs.existsSync(esbuildPath)) {
      const esbuildPackage = JSON.parse(fs.readFileSync(esbuildPath, "utf8"));
      isCorrectVersion = esbuildPackage.version === "0.17.19";
    }
    if (!isCorrectVersion) {
      // Download esbuild from npm in tmp and copy over
      console.log("npm installing esbuild binary");
      await installNodeModuleInTempDirAndCopyToCurrent(
        "esbuild@0.17.19",
        "@esbuild",
      );
    } else {
      console.log("esbuild@0.17.19 is already installed.");
    }
  }

  console.log("[info] Copying sqlite node binding from core");
  await new Promise((resolve, reject) => {
    ncp(
      path.join(__dirname, "../../../core/node_modules/sqlite3/build"),
      path.join(__dirname, "../out/build"),
      { dereference: true },
      (error) => {
        if (error) {
          console.warn("[error] Error copying sqlite3 files", error);
          reject(error);
        } else {
          resolve();
        }
      },
    );
  });

  // Copied here as well for the VS Code test suite
  await new Promise((resolve, reject) => {
    ncp(
      path.join(__dirname, "../../../core/node_modules/sqlite3/build"),
      path.join(__dirname, "../out"),
      { dereference: true },
      (error) => {
        if (error) {
          console.warn("[error] Error copying sqlite3 files", error);
          reject(error);
        } else {
          resolve();
        }
      },
    );
  });

  // Copy sqlite3 binary to additional locations where bindings package might look for it
  const sqlite3BinaryPath = path.join(__dirname, "../../../core/node_modules/sqlite3/build/Release/node_sqlite3.node");
  const additionalPaths = [
    path.join(__dirname, "../out/build/Release/node_sqlite3.node"),
    path.join(__dirname, "../out/build/Debug/node_sqlite3.node"),
    path.join(__dirname, "../out/build/default/node_sqlite3.node"),
    path.join(__dirname, "../out/out/Release/node_sqlite3.node"),
    path.join(__dirname, "../out/out/Debug/node_sqlite3.node"),
    path.join(__dirname, "../out/Release/node_sqlite3.node"),
    path.join(__dirname, "../out/Debug/node_sqlite3.node"),
    path.join(__dirname, "../out/addon-build/release/install-root/node_sqlite3.node"),
    path.join(__dirname, "../out/addon-build/debug/install-root/node_sqlite3.node"),
    path.join(__dirname, "../out/addon-build/default/install-root/node_sqlite3.node"),
  ];

  if (fs.existsSync(sqlite3BinaryPath)) {
    for (const targetPath of additionalPaths) {
      try {
        // Ensure the directory exists
        const targetDir = path.dirname(targetPath);
        fs.mkdirSync(targetDir, { recursive: true });

        // Copy the binary
        fs.copyFileSync(sqlite3BinaryPath, targetPath);
        console.log(`[info] Copied sqlite3 binary to ${targetPath}`);
      } catch (error) {
        console.warn(`[warn] Failed to copy sqlite3 binary to ${targetPath}:`, error.message);
      }
    }
  } else {
    console.warn("[warn] sqlite3 binary not found at expected location:", sqlite3BinaryPath);
  }

  // Copy node_modules for pre-built binaries
  const NODE_MODULES_TO_COPY = [
    "esbuild",
    "@esbuild",
    "@lancedb",
    "@vscode/ripgrep",
    "workerpool",
    "sqlite3",
  ];
  fs.mkdirSync("out/node_modules", { recursive: true });

  await Promise.all(
    NODE_MODULES_TO_COPY.map(
      (mod) =>
        new Promise((resolve, reject) => {
          fs.mkdirSync(`out/node_modules/${mod}`, { recursive: true });
          ncp(
            `node_modules/${mod}`,
            `out/node_modules/${mod}`,
            { dereference: true },
            function (error) {
              if (error) {
                console.error(`[error] Error copying ${mod}`, error);
                reject(error);
              } else {
                console.log(`[info] Copied ${mod}`);
                resolve();
              }
            },
          );
        }),
    ),
  );

  console.log(`[info] Copied ${NODE_MODULES_TO_COPY.join(", ")}`);

  // Copy over any worker files
  fs.cpSync(
    "node_modules/jsdom/lib/jsdom/living/xhr/xhr-sync-worker.js",
    "out/xhr-sync-worker.js",
  );

  // Validate the all of the necessary files are present
  validateFilesPresent([
    // Queries used to create the index for @code context provider
    "tree-sitter/code-snippet-queries/c_sharp.scm",

    // Queries used for @outline and @highlights context providers
    "tag-qry/tree-sitter-c_sharp-tags.scm",

    // onnx runtime bindngs
    `bin/napi-v3/${os}/${arch}/onnxruntime_binding.node`,
    `bin/napi-v3/${os}/${arch}/${
      os === "darwin"
        ? "libonnxruntime.1.14.0.dylib"
        : os === "linux"
          ? "libonnxruntime.so.1.14.0"
          : "onnxruntime.dll"
    }`,
    "builtin-themes/dark_modern.json",

    // Code/styling for the sidebar
    "gui/assets/index.js",
    "gui/assets/index.css",

    // Tutorial
    "media/welcome.md",
    "pearai_tutorial.py",
    "config_schema.json",

    // Embeddings model
    "models/all-MiniLM-L6-v2/config.json",
    "models/all-MiniLM-L6-v2/special_tokens_map.json",
    "models/all-MiniLM-L6-v2/tokenizer_config.json",
    "models/all-MiniLM-L6-v2/tokenizer.json",
    "models/all-MiniLM-L6-v2/vocab.txt",
    "models/all-MiniLM-L6-v2/onnx/model_quantized.onnx",

    // node_modules (it's a bit confusing why this is necessary)
    `node_modules/@vscode/ripgrep/bin/rg${exe}`,

    // out directory (where the extension.js lives)
    // "out/extension.js", This is generated afterward by vsce
    // web-tree-sitter
    "out/tree-sitter.wasm",
    // Worker required by jsdom
    "out/xhr-sync-worker.js",
    // SQLite3 Node native module
    "out/build/Release/node_sqlite3.node",

    // out/node_modules (to be accessed by extension.js)
    `out/node_modules/@vscode/ripgrep/bin/rg${exe}`,
    `out/node_modules/@esbuild/${
      target === "win32-arm64"
        ? "esbuild.exe"
        : target === "win32-x64"
          ? "win32-x64/esbuild.exe"
          : `${target}/bin/esbuild`
    }`,
    `out/node_modules/@lancedb/vectordb-${
      os === "win32"
        ? "win32-x64-msvc"
        : `${target}${os === "linux" ? "-gnu" : ""}`
    }/index.node`,
    `out/node_modules/esbuild/lib/main.js`,
    `out/node_modules/esbuild/bin/esbuild`,
  ]);
})();
