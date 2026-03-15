'use client';

import { useEffect, useRef } from 'react';
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
  getDepthTransform: (layer: 'foreground' | 'midground' | 'background') => {
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
  const isMobileRef = useRef(false);

  useEffect(() => {
    const checkMobile = () => {
      isMobileRef.current = window.innerWidth < 768;
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
    if (isMobileRef.current || reducedMotionQuery) return;

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

  const getDepthTransform = (layer: 'foreground' | 'midground' | 'background') => {
    const config = reducedMotionQuery
      ? HOMEPAGE_MOTION.reducedMotion
      : isMobileRef.current
        ? HOMEPAGE_MOTION.mobile
        : HOMEPAGE_MOTION.desktop;

    const layerWeight = HOMEPAGE_MOTION.layers[layer];

    const smoothX = useSpring(pointerX, { damping: 20, stiffness: 300 });
    const smoothY = useSpring(pointerY, { damping: 20, stiffness: 300 });

    const x = useTransform(
      smoothX,
      (v) => v * config.pointerAmplitude * layerWeight * 20
    );
    const y = useTransform(
      smoothY,
      (v) => v * config.pointerAmplitude * layerWeight * 20
    );

    const blur = useTransform(
      scrollProgress,
      (v) => v * config.scrollAmplitude * layerWeight * config.blurRange.max
    );

    return { x, y, blur };
  };

  return {
    pointerX,
    pointerY,
    scrollProgress,
    isReducedMotion: reducedMotionQuery ?? false,
    isMobile: isMobileRef.current,
    getDepthTransform,
  };
}
