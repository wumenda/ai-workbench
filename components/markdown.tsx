"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { memo, useEffect, useState } from "react";
import type { Highlighter } from "shiki";
import { Check, Copy } from "lucide-react";

// Shiki 懒加载单例：只在第一段代码块出现时才拉起
let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((shiki) =>
      shiki.createHighlighter({
        themes: ["github-dark"],
        langs: [
          "typescript",
          "javascript",
          "tsx",
          "jsx",
          "python",
          "json",
          "bash",
          "shell",
          "html",
          "css",
          "sql",
          "yaml",
          "markdown",
          "rust",
          "go",
          "java",
          "c",
          "cpp",
          "diff",
          "text",
        ],
      })
    );
  }
  return highlighterPromise;
}

function CodeBlock({ className, children }: { className?: string; children: string }) {
  const lang = /language-(\w+)/.exec(className || "")?.[1] ?? "text";
  const code = children.replace(/\n$/, "");
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    getHighlighter()
      .then((h) => {
        if (!active) return;
        try {
          setHtml(h.codeToHtml(code, { lang, theme: "github-dark" }));
        } catch {
          // 语言不在支持列表时保持纯文本
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [code, lang]);

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border">
      <button
        onClick={copy}
        className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md bg-black/40 px-2 py-1 text-xs text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
        aria-label="复制代码"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "已复制" : "复制"}
      </button>
      {html ? (
        <div className="[&>pre]:!my-0 [&>pre]:!rounded-none [&>pre]:p-4 [&>pre]:text-[13px] [&>pre]:leading-6" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="!my-0 rounded-none bg-[#0d1117] p-4 text-[13px] leading-6 text-zinc-200">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

// 流式期间：只跑 remark-gfm（快、容错）；
// 结束后：加数学公式 + 由 CodeBlock 懒挂 Shiki 高亮。
export const Markdown = memo(function Markdown({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={streaming ? [remarkGfm] : [remarkGfm, remarkMath]}
        rehypePlugins={
          streaming
            ? []
            : [[rehypeKatex, { throwOnError: false, output: "html" }]]
        }
        components={{
          // block 代码交给 CodeBlock（含复制按钮 + Shiki）
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const text = String(children);
            const isBlock =
              /language-/.test(className || "") || text.includes("\n");
            if (isBlock) {
              return <CodeBlock className={className}>{text}</CodeBlock>;
            }
            return (
              <code className="rounded bg-muted px-1.5 py-0.5 text-[0.9em]">
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
