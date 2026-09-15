import React from 'react';
import { Phone } from 'lucide-react';
import { formatPhoneNumber, cn } from '@/lib/utils';

const PhoneNumberDisplay = ({ 
  phoneNumber, 
  className, 
  iconClassName,
  showIcon = true,
  showLabel = false // Option to show text label only or different format if needed
}) => {
  if (!phoneNumber) return null;

  const formatted = formatPhoneNumber(phoneNumber);
  
  // Basic cleaning for the tel: link (remove spaces, parens, dashes, keep + and digits)
  const telLink = `tel:${phoneNumber.replace(/[^\d+]/g, '')}`;

  return (
    <a 
      href={telLink}
      className={cn(
        "inline-flex items-center gap-2 transition-all duration-200",
        "text-gray-700 dark:text-gray-300",
        "hover:text-blue-600 dark:hover:text-blue-400 hover:underline decoration-blue-600/30",
        "cursor-pointer group select-text",
        className
      )}
      onClick={(e) => e.stopPropagation()}
      title="Click to call"
    >
      {showIcon && (
        <div className={cn(
          "flex items-center justify-center rounded-full bg-transparent group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-colors p-0.5",
          "-ml-1" // Slight negative margin to offset padding
        )}>
          <Phone 
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:scale-110",
              "text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400",
              iconClassName
            )} 
          />
        </div>
      )}
      <span className="font-mono text-inherit">{formatted}</span>
    </a>
  );
};

export default PhoneNumberDisplay;