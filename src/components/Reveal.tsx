"use client";

import { useEffect, useRef, useState, type ReactNode, type ElementType } from "react";

type Props = {
  as?: ElementType;
  delay?: 1 | 2 | 3 | 4;
  className?: string;
  children: ReactNode;
  style?: React.CSSProperties;
};

// Drop-in for the prototype's `.reveal` + reveal-delay-N classes — driven
// by IntersectionObserver instead of a manual scroll handler.
export default function Reveal({ as: Tag = "div", delay, className = "", children, style }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -30px 0px" }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const classes = [
    "reveal",
    delay ? `reveal-delay-${delay}` : "",
    visible ? "visible" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <Tag ref={ref as any} className={classes} style={style}>
      {children}
    </Tag>
  );
}
