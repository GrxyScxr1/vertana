import { transformerTwoslash } from "@shikijs/vitepress-twoslash";
import deflist from "markdown-it-deflist";
import process from "node:process";
import { ModuleKind, ModuleResolutionKind, ScriptTarget } from "typescript";
import { defineConfig } from "vitepress";
import {
  groupIconMdPlugin,
  groupIconVitePlugin,
} from "vitepress-plugin-group-icons";
import llmstxt from "vitepress-plugin-llms";

const MANUALS = {
  text: "Manuals",
  items: [
    { text: "Glossary deep dive", link: "/manuals/glossary" },
    { text: "Translation quality", link: "/manuals/quality" },
    { text: "Context sources", link: "/manuals/context" },
    { text: "CLI reference", link: "/manuals/cli" },
  ],
};

const REFERENCES = {
  text: "References",
  items: [
    { text: "@vertana/core", link: "https://jsr.io/@vertana/core/doc" },
    { text: "@vertana/facade", link: "https://jsr.io/@vertana/facade/doc" },
    { text: "@vertana/cli", link: "https://jsr.io/@vertana/cli/doc" },
  ],
};

const TOP_NAV = [
  { text: "Getting started", link: "/start" },
  { text: "Tutorial", link: "/tutorial" },
];

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Vertana",
  description: "LLM-powered agentic translation library for TypeScript",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: "Home", link: "/" },
      ...TOP_NAV,
      MANUALS,
      REFERENCES,
    ],

    sidebar: [
      ...TOP_NAV,
      MANUALS,
      REFERENCES,
      { text: "Changelog", link: "/changelog" },
    ],

    socialLinks: [
      { icon: "jsr", link: "https://jsr.io/@vertana" },
      { icon: "npm", link: "https://www.npmjs.com/package/@vertana/facade" },
      { icon: "github", link: "https://github.com/dahlia/vertana" },
    ],

    editLink: {
      pattern: "https://github.com/dahlia/vertana/edit/main/docs/:path",
    },

    outline: "deep",

    search: {
      provider: "local",
      options: {},
    },
  },

  cleanUrls: true,

  markdown: {
    languages: ["js", "jsx", "ts", "tsx"],
    codeTransformers: [
      transformerTwoslash({
        twoslashOptions: {
          compilerOptions: {
            moduleResolution: ModuleResolutionKind.Bundler,
            module: ModuleKind.ESNext,
            target: ScriptTarget.ESNext,
            lib: ["dom", "dom.iterable", "esnext"],
            types: ["dom", "dom.iterable", "esnext", "node"],
          },
        },
      }),
    ],
    config(md) {
      md.use(deflist);
      md.use(groupIconMdPlugin);
    },
  },

  sitemap: {
    hostname: process.env.SITEMAP_HOSTNAME!,
  },

  vite: {
    plugins: [
      groupIconVitePlugin(),
      llmstxt({
        ignoreFiles: [
          "changelog.md",
        ],
      }),
    ],
  },

  transformHead(context) {
    return [
      [
        "meta",
        { property: "og:title", content: context.title },
      ],
      [
        "meta",
        { property: "og:description", content: context.description },
      ],
    ];
  },
});
