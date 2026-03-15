'use client';

import { useEffect, useState } from 'react';
import {
  useMotionValue,
  useSpring,
  useScroll,
  useTransform,
  useReducedMotion,
  MotionValue,
} from 'motion/react';
import { HOMEPAGE_MOTION } from './homepage-constants';

export interface HomepageMotionValues {
  pointerX: MotionValue<number>;
  pointerY: MotionValue<number>;
  scrollProgress: MotionValue<number>;
  isReducedMotion: boolean;
  isMobile: boolean;
  foreground: {
    x: MotionValue<number>;
    y: MotionValue<number>;
    blur: MotionValue<number>;
    rotateX: MotionValue<number>;
    rotateY: MotionValue<number>;
  };
  midground: {
    x: MotionValue<number>;
    y: MotionValue<number>;
    blur: MotionValue<number>;
  };
  background: {
    x: MotionValue<number>;
    y: MotionValue<number>;
    blur: MotionValue<number>;
  };
}

export function useHomepageMotion(): HomepageMotionValues {
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const scrollProgress = useMotionValue(0);
  const reducedMotionQuery = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const { scrollY } = useScroll();
  useEffect(() => {
    return scrollY.onChange((latest) => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      scrollProgress.set(maxScroll > 0 ? latest / maxScroll : 0);
    });
  }, [scrollY, scrollProgress]);

  useEffect(() => {
    if (isMobile || reducedMotionQuery) return;

    const handleMouseMove = (e: MouseEvent) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const normalizedX = (e.clientX - centerX) / centerX;
      const normalizedY = (e.clientY - centerY) / centerY;
      pointerX.set(normalizedX);
      pointerY.set(normalizedY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [pointerX, pointerY, reducedMotionQuery]);

  const smoothX = useSpring(pointerX, { damping: 20, stiffness: 300 });
  const smoothY = useSpring(pointerY, { damping: 20, stiffness: 300 });

  const config = reducedMotionQuery
    ? HOMEPAGE_MOTION.reducedMotion
    : isMobile
      ? HOMEPAGE_MOTION.mobile
      : HOMEPAGE_MOTION.desktop;

  const foreground = {
    x: useTransform(smoothX, (v) => v * config.pointerAmplitude * HOMEPAGE_MOTION.layers.foreground * 20),
    y: useTransform(smoothY, (v) => v * config.pointerAmplitude * HOMEPAGE_MOTION.layers.foreground * 20),
    blur: useTransform(scrollProgress, (v) => v * config.scrollAmplitude * HOMEPAGE_MOTION.layers.foreground * config.blurRange.max),
    rotateX: useTransform(smoothY, (v) => v * -2),
    rotateY: useTransform(smoothX, (v) => v * 2),
  };

  const midground = {
    x: useTransform(smoothX, (v) => v * config.pointerAmplitude * HOMEPAGE_MOTION.layers.midground * 20),
    y: useTransform(smoothY, (v) => v * config.pointerAmplitude * HOMEPAGE_MOTION.layers.midground * 20),
    blur: useTransform(scrollProgress, (v) => v * config.scrollAmplitude * HOMEPAGE_MOTION.layers.midground * config.blurRange.max),
  };

  const background = {
    x: useTransform(smoothX, (v) => v * config.pointerAmplitude * HOMEPAGE_MOTION.layers.background * 20),
    y: useTransform(smoothY, (v) => v * config.pointerAmplitude * HOMEPAGE_MOTION.layers.background * 20),
    blur: useTransform(scrollProgress, (v) => v * config.scrollAmplitude * HOMEPAGE_MOTION.layers.background * config.blurRange.max),
  };

  return {
    pointerX,
    pointerY,
    scrollProgress,
    isReducedMotion: reducedMotionQuery ?? false,
    isMobile,
    foreground,
    midground,
    background,
  };
}
