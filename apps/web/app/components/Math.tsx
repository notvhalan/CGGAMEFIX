import katex from "katex";

interface MathProps {
  math: string;
  className?: string;
}

export function InlineMath({ math, className }: MathProps) {
  const html = katex.renderToString(math, {
    throwOnError: false,
    displayMode: false,
  });
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function BlockMath({ math, className }: MathProps) {
  const html = katex.renderToString(math, {
    throwOnError: false,
    displayMode: true,
  });
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
