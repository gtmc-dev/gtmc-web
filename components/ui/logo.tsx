import Link from "next/link";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

export function Logo({ className = "", size = "md" }: LogoProps) {
  const sizeClasses = {
    sm: "text-sm",
    md: "text-xl",
    lg: "text-3xl",
    xl: "text-5xl md:text-6xl",
  };
  
  const slashClasses = {
    sm: "text-[10px]",
    md: "text-sm",
    lg: "text-lg",
    xl: "text-2xl",
  };

  return (
    <Link 
      href="/" 
      className={`inline-flex items-center font-sans tracking-widest transition-opacity hover:opacity-80 ${sizeClasses[size]} ${className}`}
    >
      <span className={`opacity-40 font-light mr-1 text-tech-main ${slashClasses[size]}`}>{"//"}</span>
      <span className="font-bold text-tech-main-dark">GTMC</span>
    </Link>
  );
}
