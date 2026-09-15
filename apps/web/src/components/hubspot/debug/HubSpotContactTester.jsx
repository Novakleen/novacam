import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx';
import { RefreshCw, Plus, ChevronRight, Check } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import ContactDetailView from './ContactDetailView';

// Utility function to format phone numbers (basic example)
const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return <span className="text-gray-400 italic">N/A</span>;
  // Basic formatting for common US numbers
  const cleaned = ('' + phoneNumber).replace(/\D/g, '');
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return `(${match[1]}) ${match[2]}-${match[3]}`;
  }
  return phoneNumber; // Return as-is if no match
};

const HubSpotContactTester = ({ createContact, fetchContacts, loading }) => {
  const [contacts, setContacts] = useState([]);
  const [pagination, setPagination] = useState({ after: null });
  const [selectedContact, setSelectedContact] = useState(null);
  const [newContact, setNewContact] = useState({
    firstname: '',
    lastname: '',
    email: '',
    phone: ''
  });

  const handleFetch = async (after = null) => {
    const result = await fetchContacts(10, after);
    if (result.success && result.data) {
      setContacts(result.data.results || []);
      if (result.data.paging && result.data.paging.next) {
        setPagination({ after: result.data.paging.next.after });
      } else {
        setPagination({ after: null });
      }
      // Optional: Select first contact automatically if none selected
      // if (!selectedContact && result.data.results?.length > 0) {
      //   setSelectedContact(result.data.results[0]);
      // }
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const result = await createContact(newContact);
    if (result.success) {
      handleFetch(); // Refresh list
      setNewContact({ firstname: '', lastname: '', email: '', phone: '' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Contact Form - Full Width */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Create Test Contact</CardTitle>
          <CardDescription>Directly create a contact in HubSpot to test write permissions.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstname">First Name</Label>
                <Input 
                  id="firstname"
                  value={newContact.firstname} 
                  onChange={(e) => setNewContact({...newContact, firstname: e.target.value})}
                  required
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastname">Last Name</Label>
                <Input 
                  id="lastname"
                  value={newContact.lastname} 
                  onChange={(e) => setNewContact({...newContact, lastname: e.target.value})}
                  required
                  placeholder="Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email"
                  type="email" 
                  value={newContact.email} 
                  onChange={(e) => setNewContact({...newContact, email: e.target.value})}
                  required
                  placeholder="john@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input 
                  id="phone"
                  value={newContact.phone} 
                  onChange={(e) => setNewContact({...newContact, phone: e.target.value})}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" /> Create Contact
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Main Content Grid: Table & Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* List Contacts */}
        <Card className="flex flex-col h-[600px] overflow-hidden">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 bg-gray-50/50 border-b">
            <CardTitle className="text-base font-semibold">Contacts List</CardTitle>
            <div className="flex gap-2">
               {selectedContact && (
                 <Button variant="ghost" size="sm" onClick={() => setSelectedContact(null)} className="h-8 text-xs">
                   Clear Selection
                 </Button>
               )}
               <Button variant="outline" size="sm" onClick={() => handleFetch()} disabled={loading} className="h-8">
                <RefreshCw className={`h-3.5 w-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0">
            {contacts.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground text-sm px-6">
                <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                   <RefreshCw className="h-5 w-5 text-gray-400" />
                </div>
                No contacts loaded.<br/>Click refresh to fetch from HubSpot.
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-white sticky top-0 z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="w-[40%]">Name</TableHead>
                    <TableHead>Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => {
                    const isSelected = selectedContact?.id === contact.id;
                    return (
                      <TableRow 
                        key={contact.id}
                        onClick={() => setSelectedContact(contact)}
                        className={cn(
                          "cursor-pointer transition-all duration-200 border-l-[3px]",
                          isSelected 
                            ? "bg-blue-50 dark:bg-blue-900/10 border-l-blue-500 shadow-sm" 
                            : "border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-l-gray-300"
                        )}
                      >
                        <TableCell className="font-medium py-3">
                          <div className="flex items-center gap-2">
                             {isSelected ? (
                               <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                             ) : (
                               <div className="h-2 w-2 rounded-full bg-transparent shrink-0" />
                             )}
                             <span className={cn(isSelected ? "text-blue-700 dark:text-blue-300" : "")}>
                                {contact.properties.firstname} {contact.properties.lastname}
                             </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-xs text-muted-foreground truncate max-w-[150px]">
                          {contact.properties.email}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            
            {pagination.after && (
              <div className="p-4 border-t flex justify-center bg-gray-50/50">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleFetch(pagination.after)}
                  disabled={loading}
                  className="w-full"
                >
                  Load Next Page <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact Detail View */}
        <div className="h-[600px]">
           <ContactDetailView 
              contact={selectedContact} 
              onClose={() => setSelectedContact(null)} 
            />
        </div>
      </div>
    </div>
  );
};

export default HubSpotContactTester;