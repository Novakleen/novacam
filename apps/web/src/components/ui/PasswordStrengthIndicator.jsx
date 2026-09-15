import React from 'react';
import { Check, X } from 'lucide-react';

const PasswordStrengthIndicator = ({ password }) => {
  const criteria = [
    { label: 'At least 8 characters', valid: password.length >= 8 },
    { label: 'Contains uppercase letter', valid: /[A-Z]/.test(password) },
    { label: 'Contains number', valid: /[0-9]/.test(password) },
    { label: 'Contains special character', valid: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ];

  const validCount = criteria.filter(c => c.valid).length;
  
  const getStrengthColor = () => {
    if (validCount <= 1) return 'bg-red-500';
    if (validCount <= 3) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStrengthText = () => {
    if (validCount <= 1) return 'Weak';
    if (validCount <= 3) return 'Medium';
    return 'Strong';
  };

  return (
    <div className="space-y-3 mt-2">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-500 font-medium">Password Strength</span>
        <span className={`font-bold ${
          validCount <= 1 ? 'text-red-500' : 
          validCount <= 3 ? 'text-yellow-600' : 'text-green-600'
        }`}>
          {getStrengthText()}
        </span>
      </div>
      
      <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-300 ${getStrengthColor()}`} 
          style={{ width: `${(validCount / 4) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {criteria.map((item, index) => (
          <div key={index} className="flex items-center text-xs text-gray-500">
             {item.valid ? (
               <Check className="h-3 w-3 text-green-500 mr-1.5 shrink-0" />
             ) : (
               <X className="h-3 w-3 text-gray-300 mr-1.5 shrink-0" />
             )}
             <span className={item.valid ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400'}>
               {item.label}
             </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PasswordStrengthIndicator;