// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const { themes } = require("prism-react-renderer");
const lightCodeTheme = themes.github;
const darkCodeTheme = themes.dracula;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Dropstone",
  tagline:
    "the open-source library for accelerating software development with language models",
  favicon: "img/favicon.ico",

  // Set the production url of your site here
  url: "https://dropstone.io",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "/",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "Dropstone", // Usually your GitHub org/user name.
  projectName: "Dropstone", // Usually your repo name.

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  themes: [["docusaurus-json-schema-plugin", {}]],

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: "/",
          sidebarPath: require.resolve("./sidebars.js"),
          editUrl: "https://github.com/trypear/pearai-app/tree/main/docs",
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
        gtag: {
          trackingID: "G-M3JWW8N2XQ",
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      metadata: [
        {
          name: "keywords",
          content:
            "open source, ai, vscode, intellij, jetbrains, developer tools, chatgpt, copilot, llm",
        },
      ],
      // Replace with your project's social card
      image: "https://dropstone.io/img/continue-social-card.png",
      navbar: {
        title: "Dropstone",
        logo: {
          alt: "Dropstone Logo",
          src: "img/logo-dark.png",
          href: "https://dropstone.io",
          srcDark: "img/logo.png",
        },
        items: [
          {
            type: "docSidebar",
            sidebarId: "docsSidebar",
            position: "left",
            label: "Docs",
          },
          {
            to: "https://github.com/trypear/pearai-app",
            label: "GitHub",
            position: "right",
            className: "github-navbar",
          },
          {
            to: "https://discord.gg/7QMraJUsQt",
            label: "Discord",
            position: "right",
            className: "discord-navbar",
          },
        ],
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "Extensions",
            items: [
              {
                label: "VS Code",
                to: "https://marketplace.visualstudio.com/items?itemName=PearAI.continue",
              },
              {
                label: "JetBrains",
                to: "https://plugins.jetbrains.com/plugin/22707-continue-extension",
              },
            ],
          },
          {
            title: "Community",
            items: [
              {
                label: "Discord",
                to: "https://discord.gg/7QMraJUsQt",
              },
              {
                label: "GitHub",
                to: "https://github.com/trypear/pearai-app",
              },
            ],
          },
          {
            title: "Follow Us",
            items: [
              {
                label: "Twitter",
                to: "https://twitter.com/continuedev",
              },
              {
                label: "LinkedIn",
                to: "https://linkedin.com/company/trypearai",
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Dropstone Dev, Inc.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: ["json"],
      },
      algolia: {
        // The application ID provided by Algolia
        appId: "0OMUMCQZVV",

        // Public API key: it is safe to commit it
        apiKey: "6795de0f612eebe17018f8061a9ef18e",

        indexName: "pearai",

        // Optional: see doc section below
        contextualSearch: true,
      },
    }),
  plugins: [
    [
      "@docusaurus/plugin-client-redirects",
      {
        redirects: [
          // Redirects from old docs
          {
            from: "/customization",
            to: "/customization/overview",
          },
          {
            from: "/getting-started",
            to: "/quickstart",
          },
          {
            from: "/model-setup/overview",
            to: "/setup/overview",
          },
          {
            from: "/model-setup/select-model",
            to: "/setup/select-model",
          },
          {
            from: "/model-setup/configuration",
            to: "/setup/configuration",
          },
        ],
      },
    ],
  ],
};

module.exports = config;
