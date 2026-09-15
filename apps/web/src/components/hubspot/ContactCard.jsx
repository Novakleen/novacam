import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { 
  CheckCircle2, AlertCircle, Clock, MoreHorizontal, 
  Mail, Phone, Building2 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import PhoneNumberDisplay from '@/components/PhoneNumberDisplay';

const ContactCard = ({ contact, onClick }) => {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success':
        return "border-green-200 bg-green-50/30 text-green-700";
      case 'failed':
        return "border-red-200 bg-red-50/30 text-red-700";
      default:
        return "border-yellow-200 bg-yellow-50/30 text-yellow-700";
    }
  };

  // Helper to safely get properties whether flat or nested
  const getProperty = (propName) => {
    // If it's directly on the object (from Supabase/DB structure)
    if (contact[propName]) return contact[propName];
    // If it's in a properties object (from HubSpot API structure)
    if (contact.properties && contact.properties[propName]) return contact.properties[propName];
    return null;
  };

  const firstName = getProperty('first_name') || getProperty('firstname') || '';
  const lastName = getProperty('last_name') || getProperty('lastname') || '';
  const email = getProperty('email');
  const phone = getProperty('phone');
  const company = getProperty('company');
  const createdAt = contact.created_at || contact.createdAt;

  return (
    <Card 
      onClick={() => onClick(contact)}
      className="group relative overflow-hidden cursor-pointer hover:shadow-xl transition-all duration-300 border-gray-200/60 dark:border-gray-800 hover:border-blue-300/50 dark:hover:border-blue-700/50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm"
    >
      <CardContent className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900 dark:to-indigo-900 flex items-center justify-center text-blue-700 dark:text-blue-200 font-bold text-sm">
              {firstName?.[0]}{lastName?.[0]}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white leading-tight">
                {firstName} {lastName}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Added {createdAt ? format(new Date(createdAt), 'MMM d, yyyy') : 'Unknown'}
              </p>
            </div>
          </div>
          
          <Badge variant="outline" className={cn("gap-1.5 px-2.5 py-0.5 transition-colors", getStatusColor(contact.sync_status))}>
            {getStatusIcon(contact.sync_status)}
            <span className="capitalize">{contact.sync_status || 'Pending'}</span>
          </Badge>
        </div>

        <div className="space-y-2.5 mb-4">
          <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300">
            <Mail className="h-3.5 w-3.5 text-gray-400" />
            <span className="truncate">{email || 'No email'}</span>
          </div>
          
          <div className="flex items-center gap-2.5 text-sm min-h-[20px]">
            {phone ? (
              <PhoneNumberDisplay 
                phoneNumber={phone} 
                className="text-sm text-gray-600 dark:text-gray-300"
                iconClassName="h-3.5 w-3.5"
              />
            ) : (
              <>
                <Phone className="h-3.5 w-3.5 text-gray-400" />
                <span className="truncate font-mono text-xs text-gray-400 italic">No phone</span>
              </>
            )}
          </div>

          {company && (
            <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300">
              <Building2 className="h-3.5 w-3.5 text-gray-400" />
              <span className="truncate">{company}</span>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
           <div className="text-xs text-gray-400">
             {contact.last_synced_at ? (
               <span>Synced {format(new Date(contact.last_synced_at), 'h:mm a')}</span>
             ) : (
               <span>Not synced yet</span>
             )}
           </div>
           
           <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
             <MoreHorizontal className="h-4 w-4 text-gray-500" />
           </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ContactCard;