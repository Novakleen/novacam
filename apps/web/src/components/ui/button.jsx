import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import React from 'react';

const buttonVariants = cva(
	'inline-flex items-center justify-center rounded-xl text-sm font-semibold ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95 hover:shadow-md',
	{
		variants: {
			variant: {
				default: 
          'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20',
				destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-lg hover:shadow-destructive/20',
				outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground shadow-sm',
				secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:shadow-sm',
				ghost: 
          'hover:bg-accent hover:text-accent-foreground shadow-none hover:shadow-none',
				link: 
          'text-primary underline-offset-4 hover:underline shadow-none hover:shadow-none active:scale-100',
			},
			size: {
				default: 'h-11 px-5 py-2',
				sm: 'h-9 rounded-lg px-3 text-xs',
				lg: 'h-12 rounded-xl px-8 text-base',
				icon: 'h-11 w-11',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
	const Comp = asChild ? Slot : 'button';
	return (
		<Comp
			className={cn(buttonVariants({ variant, size, className }))}
			ref={ref}
			{...props}
		/>
	);
});
Button.displayName = 'Button';

export { Button, buttonVariants };