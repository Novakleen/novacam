import React from 'react';
import { Check, User, Building, Phone, Mail, Cloud, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn, formatPhoneNumber } from '@/lib/utils';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

// Component to highlight matched text parts
const HighlightedText = ({ text, highlight }) => {
    if (!text) return null;
    if (!highlight || highlight.length < 2) return <span>{text}</span>;

    try {
        // Escape regex characters from the query
        const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = text.split(new RegExp(`(${escapedHighlight})`, 'gi'));
        
        return (
            <span>
                {parts.map((part, i) => 
                    part.toLowerCase() === highlight.toLowerCase() ? 
                    <span key={i} className="font-bold text-blue-600 bg-blue-100/50 rounded-sm px-0.5 -mx-0.5">{part}</span> : 
                    <span key={i}>{part}</span>
                )}
            </span>
        );
    } catch (e) {
        // Fallback if regex fails
        return <span>{text}</span>;
    }
};

const HubSpotContactSearchResults = ({
  contacts,
  selectedId,
  onSelect,
  loading,
  hasMore,
  onLoadMore,
  totalCount,
  loadingMore,
  searchQuery
}) => {
  
  if (!loading && contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed rounded-md bg-gray-50/50 min-h-[150px]">
        <User className="h-8 w-8 text-gray-300 mb-2" />
        <p className="text-sm font-medium text-gray-900">No contacts found</p>
        <p className="text-xs text-muted-foreground mt-1">
            {searchQuery && searchQuery.length < 3 
                ? "Try typing a longer name for better results" 
                : "Try specific names, emails, or company names"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[200px] max-h-[400px]">
      <ScrollArea className="flex-1 pr-4 -mr-4">
        <div className="space-y-2 p-1">
          {contacts.map((contact) => {
            const isSelected = selectedId === contact.id;
            const firstName = contact.first_name || contact.firstname || '';
            const lastName = contact.last_name || contact.lastname || '';
            const fullName = `${firstName} ${lastName}`.trim() || contact.email || 'Unknown Contact';
            const matchedField = contact._matchedField;
            const score = contact._score || 0;

            return (
              <HoverCard key={contact.id} openDelay={400}>
                <HoverCardTrigger asChild>
                  <div
                    onClick={() => onSelect(contact)}
                    className={cn(
                      "group flex items-start justify-between p-3 rounded-lg border cursor-pointer transition-all duration-200 relative overflow-hidden",
                      isSelected 
                        ? "bg-blue-50 border-blue-200 shadow-sm" 
                        : "bg-white border-transparent hover:bg-blue-50/50 hover:border-blue-100"
                    )}
                  >
                    {/* Relevance Indicator Bar - Show even for low scores if it's in the list */}
                    {score > 0 && !isSelected && (
                      <div 
                        className={cn("absolute left-0 top-0 bottom-0 w-0.5 transition-all opacity-0 group-hover:opacity-100", 
                          score >= 100 ? "bg-green-500" : score >= 75 ? "bg-blue-400" : "bg-gray-300"
                        )} 
                        title={`Match Score: ${Math.round(score)}`}
                      />
                    )}

                    <div className="flex gap-3 overflow-hidden w-full">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                        isSelected ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500 group-hover:bg-blue-100/50 group-hover:text-blue-500"
                      )}>
                        <User className="w-4 h-4" />
                      </div>
                      
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            "font-medium text-sm truncate",
                            isSelected ? "text-blue-900" : "text-gray-900"
                          )}>
                             <HighlightedText text={fullName} highlight={searchQuery} />
                          </span>
                          
                          {/* API Badge */}
                          <Badge variant="outline" className="text-[10px] h-4 px-1 bg-gray-50 text-gray-500 border-gray-200 flex gap-0.5 font-normal shrink-0">
                             <Cloud className="h-2 w-2" /> API
                          </Badge>
                          
                          {/* Matched Field Indicator */}
                          {matchedField && (
                             <span className={cn("text-[10px] flex items-center gap-0.5 px-1 rounded-sm shrink-0", 
                               isSelected ? "text-blue-700 bg-blue-100" : "text-blue-600 bg-blue-50"
                             )}>
                               <Sparkles className="h-2 w-2" /> Found in {matchedField}
                             </span>
                          )}
                        </div>
                        
                        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground mt-1">
                          {contact.email && (
                            <span className={cn(
                              "truncate flex items-center gap-1.5",
                              matchedField === 'Email' && "text-blue-700 font-medium"
                            )}>
                               <Mail className="h-3 w-3 opacity-70 shrink-0" /> 
                               <HighlightedText text={contact.email} highlight={searchQuery} />
                            </span>
                          )}
                          {contact.company && (
                            <span className={cn(
                              "truncate flex items-center gap-1.5",
                              matchedField === 'Company' && "text-blue-700 font-medium"
                            )}>
                               <Building className="h-3 w-3 opacity-70 shrink-0" /> 
                               <HighlightedText text={contact.company} highlight={searchQuery} />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="shrink-0 mt-1 ml-2">
                        <Check className="w-4 h-4 text-blue-600" />
                      </div>
                    )}
                  </div>
                </HoverCardTrigger>
                
                <HoverCardContent side="right" className="w-80">
                   <div className="space-y-3">
                      <div className="flex items-start justify-between">
                         <h4 className="text-sm font-semibold">{fullName}</h4>
                         <Badge variant="secondary" className="text-[10px]">HubSpot Contact</Badge>
                      </div>
                      
                      <div className="grid gap-2">
                         {contact.email && (
                             <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Mail className="h-3.5 w-3.5" />
                                <span>{contact.email}</span>
                             </div>
                         )}
                         {contact.phone && (
                             <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="h-3.5 w-3.5" />
                                <span>{formatPhoneNumber(contact.phone)}</span>
                             </div>
                         )}
                         {contact.company && (
                             <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Building className="h-3.5 w-3.5" />
                                <span>{contact.company}</span>
                             </div>
                         )}
                         {contact.jobtitle && (
                             <div className="text-xs text-muted-foreground mt-1">
                                <span className="font-medium text-foreground">Job Title: </span> 
                                {contact.jobtitle}
                             </div>
                         )}
                         {contact.lifecyclestage && (
                             <div className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Lifecycle: </span> 
                                {contact.lifecyclestage}
                             </div>
                         )}
                      </div>
                      
                      <Button 
                        size="sm" 
                        className="w-full mt-2" 
                        onClick={() => onSelect(contact)}
                      >
                         {isSelected ? 'Selected' : 'Select Contact'}
                      </Button>
                   </div>
                </HoverCardContent>
              </HoverCard>
            );
          })}
          
          {hasMore && (
            <div className="pt-2 pb-1">
              <Button
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                onClick={onLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin mr-2" /> Loading more...
                  </>
                ) : (
                  `Load More (${contacts.length} of ${totalCount})`
                )}
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default HubSpotContactSearchResults;