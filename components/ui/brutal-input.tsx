import * as React from "react";

export interface BrutalInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const BrutalInput = React.forwardRef<HTMLInputElement, BrutalInputProps>(
  ({ className = "", error, ...props }, ref) => {
    let baseStyles = "w-full border-[3px] border-black px-4 py-3 font-medium outline-none transition-shadow focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white";

    if (error) {
      baseStyles += " border-hot-pink focus:shadow-[4px_4px_0px_0px_#ff0099]";
    } else {
      baseStyles += " focus:border-electric-blue border-black";
    }

    return (
      <input
        ref={ref}
        className={`${baseStyles} ${className}`}
        {...props}
      />
    );
  }
);
BrutalInput.displayName = "BrutalInput";