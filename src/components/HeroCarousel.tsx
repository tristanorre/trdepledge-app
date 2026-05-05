"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const SLIDES = [
  { src: "/images/carousel-1.jpg", alt: "T.R. Depledge poster — clean cuts, quality finish" },
  { src: "/images/carousel-2.jpg", alt: "T.R. Depledge poster — fast clean ups, neat finish" },
  { src: "/images/carousel-3.jpg", alt: "T.R. Depledge poster — quality work done properly" },
  { src: "/images/carousel-4.jpg", alt: "T.R. Depledge poster — Copper Coast specialists" },
];

export default function HeroCarousel() {
  const [idx, setIdx] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = () => {
    stop();
    timer.current = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 4000);
  };
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="hero-carousel" onMouseEnter={stop} onMouseLeave={start}>
      <div className="carousel-track">
        {SLIDES.map((s, i) => (
          <div key={s.src} className={`carousel-slide${i === idx ? " active" : ""}`}>
            <Image src={s.src} alt={s.alt} width={800} height={400} priority={i === 0} />
          </div>
        ))}
      </div>
      <div className="carousel-dots">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            className={`cdot${i === idx ? " active" : ""}`}
            onClick={() => setIdx(i)}
            aria-label={`Show slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
