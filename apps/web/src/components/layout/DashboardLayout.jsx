import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Home, Image as ImageIcon, Users, Briefcase, Bell, Monitor, Map as MapIcon, 
  Menu, X, LogOut, Moon, Sun, User, UserPlus, UploadCloud, Link as LinkIcon,
  Bug, ChevronRight, MessageSquare, BarChart3, Camera, Clock, Droplets, PieChart, Truck
} from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher';
import { APP_VERSION } from '@/lib/appVersion';

const SidebarItem = ({ icon: Icon, label, path, isNew, isActive, onClick, isComingSoon, badgeNew, badgeSoon }) => (
  <motion.div 
    whileHover={{ scale: 1.02, x: 4 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`
      group flex items-center gap-3 px-4 py-3.5 rounded-2xl cursor-pointer transition-all duration-300 select-none mx-2 mb-1
      ${isActive 
        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25' 
        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
      }
    `}
  >
    <Icon className={`h-[1.35rem] w-[1.35rem] transition-colors ${isActive ? 'text-primary-foreground' : 'text-gray-400 group-hover:text-primary'}`} />
    <span className="text-[0.95rem] font-medium tracking-wide flex-1">{label}</span>
    
    {isNew && (
      <Badge variant="default" className="text-[10px] h-5 px-1.5 bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-900 shadow-none">
        {badgeNew}
      </Badge>
    )}
    
    {isComingSoon && (
      <Badge variant="secondary" className="text-[10px] h-5 px-1.5 opacity-70">
        {badgeSoon}
      </Badge>
    )}
    
    {isActive && (
       <motion.div layoutId="active-indicator" className="w-1.5 h-1.5 rounded-full bg-white ml-2" />
    )}
  </motion.div>
);

const DashboardLayout = ({ children, fullWidth = false }) => {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = React.useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const lang = (i18n.resolvedLanguage || i18n.language || 'fr').slice(0, 2);
  const releasedLabel =
    APP_VERSION.releasedLabel[lang] || APP_VERSION.releasedLabel.fr;
  const versionLine = t('app.versionLine', {
    version: APP_VERSION.version,
    month: releasedLabel,
  });

  React.useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  React.useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const fetchProfile = async () => {
    const { supabase } = await import('@/lib/customSupabaseClient');
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (data) setProfile(data);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
    toast({
      title: t('nav.signedOutTitle'),
      description: t('nav.signedOutDesc'),
    });
  };
  
  const handleComingSoon = () => {
    toast({
       title: t('nav.comingSoonTitle'),
       description: t('nav.comingSoonDesc'),
       duration: 3000,
    });
  };

  const isAdmin = profile?.role === 'Admin';
  const isAdminOrManager = profile?.role === 'Admin' || profile?.role === 'Manager';
  const isMemberLike = profile?.role === 'Member' || profile?.role === 'Viewer';

  const pageTitle = (() => {
    if (location.pathname === '/dashboard') return t('nav.overview');
    if (location.pathname.includes('/project/')) return t('nav.projectDetails');
    if (location.pathname === '/admin/users') return t('nav.userManagement');
    if (location.pathname === '/crm-hubspot') return t('nav.hubspotCrm');
    if (location.pathname === '/hubspot-debug') return t('nav.hubspotDebugger');
    if (location.pathname === '/hubspot-dashboard') return t('nav.hubspotDashboard');
    if (location.pathname === '/companycam-explorer') return t('nav.companyCam');
    if (location.pathname === '/direct7-debug') return t('nav.direct7Sms');
    if (location.pathname === '/margins') return t('nav.margins');
    if (location.pathname === '/bug-hunter') return t('nav.bugHunter');
    if (location.pathname === '/time-tracker') return t('nav.timeTracker');
    if (location.pathname === '/spray-tracker') return t('nav.sprayTracker');
    if (location.pathname.startsWith('/fleet')) return t('nav.fleet');
    if (location.pathname === '/map') return t('nav.mapView');
    if (location.pathname === '/photos') return t('nav.photos');
    if (location.pathname === '/users') return t('nav.teamMembers');
    if (location.pathname === '/portfolio') return t('nav.publicPortfolio');
    if (location.pathname === '/upload-large') return t('nav.largeFileUpload');
    return (
      location.pathname.replace('/', '').charAt(0).toUpperCase() +
      location.pathname.slice(2)
    );
  })();

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900/95 backdrop-blur-xl border-r border-gray-100 dark:border-gray-800">
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-gradient-to-br from-primary to-blue-600 rounded-2xl p-2.5 shadow-xl shadow-blue-500/20 ring-1 ring-white/10">
            <Monitor className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-gray-900 dark:text-white leading-none">Novakleen</h1>
            <p className="text-xs text-gray-500 font-medium mt-1">{t('nav.projectManagement')}</p>
          </div>
        </div>
        
        <div className="relative mb-2">
          <input 
            type="text" 
            placeholder={t('nav.searchPlaceholder')}
            className="w-full bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm pl-4 pr-4 py-3 rounded-2xl border-none focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder-gray-400 transition-all shadow-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1 scrollbar-hide">
        <div className="px-4 mb-2 mt-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('nav.mainMenu')}</h3>
        </div>

        <SidebarItem 
          icon={Home} label={t('nav.dashboard')} path="/dashboard" 
          isActive={location.pathname === '/dashboard'} onClick={() => navigate('/dashboard')}
          badgeNew={t('common.new')} badgeSoon={t('common.soon')}
        />
        <SidebarItem 
          icon={MapIcon} label={t('nav.mapView')} path="/map" 
          isActive={location.pathname === '/map'} onClick={() => navigate('/map')}
          badgeNew={t('common.new')} badgeSoon={t('common.soon')}
        />
        <SidebarItem 
          icon={ImageIcon} label={t('nav.photos')} path="/photos" 
          isActive={location.pathname === '/photos'} onClick={() => navigate('/photos')}
          badgeNew={t('common.new')} badgeSoon={t('common.soon')}
        />
        {isAdmin && (
          <SidebarItem 
            icon={Users} label={t('nav.teamMembers')} path="/users"
            isActive={location.pathname === '/users'} onClick={() => navigate('/users')}
            badgeNew={t('common.new')} badgeSoon={t('common.soon')}
          />
        )}
        <SidebarItem 
          icon={Clock} label={t('nav.timeTracker')} path="/time-tracker"
          isActive={location.pathname === '/time-tracker'} onClick={() => navigate('/time-tracker')}
          isNew
          badgeNew={t('common.new')} badgeSoon={t('common.soon')}
        />
        <SidebarItem 
          icon={Droplets} label={t('nav.sprayTracker')} path="/spray-tracker"
          isActive={location.pathname === '/spray-tracker'} onClick={() => navigate('/spray-tracker')}
          isNew
          badgeNew={t('common.new')} badgeSoon={t('common.soon')}
        />
        <SidebarItem 
          icon={Truck} label={t('nav.fleet')} path="/fleet"
          isActive={location.pathname.startsWith('/fleet')} onClick={() => navigate('/fleet')}
          isNew
          badgeNew={t('common.new')} badgeSoon={t('common.soon')}
        />
        {isAdmin && (
          <SidebarItem 
            icon={PieChart} label={t('nav.margins')} path="/margins"
            isActive={location.pathname === '/margins'} onClick={() => navigate('/margins')}
            badgeNew={t('common.new')} badgeSoon={t('common.soon')}
          />
        )}

        {!isMemberLike && isAdminOrManager && (
          <>
            <div className="px-4 mb-2 mt-6">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('nav.tools')}</h3>
            </div>

            <SidebarItem 
              icon={BarChart3} label={t('nav.hubspotDashboard')} path="/hubspot-dashboard" 
              isActive={location.pathname === '/hubspot-dashboard'} onClick={() => navigate('/hubspot-dashboard')}
              badgeNew={t('common.new')} badgeSoon={t('common.soon')}
            />

            <SidebarItem 
              icon={LinkIcon} label={t('nav.hubspotCrm')} path="/crm-hubspot" 
              isActive={location.pathname === '/crm-hubspot'} onClick={handleComingSoon} isComingSoon
              badgeNew={t('common.new')} badgeSoon={t('common.soon')}
            />

            <SidebarItem 
              icon={UploadCloud} label={t('nav.largeFileUpload')} path="/upload-large"
              isActive={location.pathname === '/upload-large'} onClick={() => navigate('/upload-large')}
              badgeNew={t('common.new')} badgeSoon={t('common.soon')}
            />
            
            {isAdmin && (
              <SidebarItem 
                icon={UserPlus} label={t('nav.userManagement')} path="/admin/users"
                isActive={location.pathname === '/admin/users'} onClick={() => navigate('/admin/users')}
                badgeNew={t('common.new')} badgeSoon={t('common.soon')}
              />
            )}
            
            <div className="mt-6 px-4 mb-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('nav.marketing')}</h3>
            </div>
            
            <SidebarItem 
              icon={Briefcase} label={t('nav.publicPortfolio')} path="/portfolio" 
              isActive={location.pathname === '/portfolio'} onClick={() => navigate('/portfolio')}
              badgeNew={t('common.new')} badgeSoon={t('common.soon')}
            />
            
            <div className="mt-6 px-4 mb-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('nav.debug')}</h3>
            </div>

            <SidebarItem 
              icon={Bug} label={t('nav.bugHunter')} path="/bug-hunter" 
              isActive={location.pathname === '/bug-hunter'} onClick={() => navigate('/bug-hunter')}
              badgeNew={t('common.new')} badgeSoon={t('common.soon')}
            />
            <SidebarItem 
              icon={Camera} label={t('nav.companyCam')} path="/companycam-explorer" 
              isActive={location.pathname === '/companycam-explorer'} onClick={() => navigate('/companycam-explorer')} isNew
              badgeNew={t('common.new')} badgeSoon={t('common.soon')}
            />
            <SidebarItem 
              icon={Bug} label={t('nav.hubspotDebugger')} path="/hubspot-debug" 
              isActive={location.pathname === '/hubspot-debug'} onClick={() => navigate('/hubspot-debug')}
              badgeNew={t('common.new')} badgeSoon={t('common.soon')}
            />
            <SidebarItem 
              icon={MessageSquare} label={t('nav.direct7Sms')} path="/direct7-debug" 
              isActive={location.pathname === '/direct7-debug'} onClick={() => navigate('/direct7-debug')}
              badgeNew={t('common.new')} badgeSoon={t('common.soon')}
            />
          </>
        )}
      </div>

      <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <LanguageSwitcher />
          <p className="text-[11px] text-gray-400 font-medium tabular-nums truncate" title={versionLine}>
            {versionLine}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2 md:hidden">
          <Button variant="ghost" className="flex-1 rounded-xl" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
            {t('common.theme')}
          </Button>
          <Button variant="ghost" className="flex-1 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            {t('common.logout')}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 flex overflow-hidden">
      <aside className="hidden md:flex w-[280px] flex-shrink-0 flex-col h-screen sticky top-0 z-30 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]">
        <SidebarContent />
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 z-40 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)} className="rounded-xl">
            <Menu className="h-6 w-6 text-gray-700 dark:text-white" />
          </Button>
          <span className="font-bold text-lg text-gray-900 dark:text-white tracking-tight">Novakleen</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher size="icon" className="h-9 w-9" />
          <Avatar className="h-9 w-9 cursor-pointer ring-2 ring-white dark:ring-gray-800 shadow-sm" onClick={() => navigate('/profile')}>
            <AvatarFallback className="bg-gradient-to-tr from-primary to-blue-400 text-white text-xs font-bold">
              {profile?.initials || 'ME'}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="md:hidden fixed top-0 left-0 bottom-0 w-[280px] z-[51] shadow-2xl bg-background"
            >
              <SidebarContent />
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="absolute top-4 right-[-48px] bg-white dark:bg-gray-800 p-2.5 rounded-full shadow-lg text-gray-600 dark:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 overflow-x-hidden overflow-y-auto pt-16 md:pt-0 relative bg-gray-50/50 dark:bg-gray-950">
        <header className="hidden md:flex items-center justify-between px-8 py-5 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl sticky top-0 z-20 border-b border-gray-100 dark:border-gray-800/50">
          <div className="flex items-center gap-4">
             {location.pathname !== '/dashboard' && (
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full h-8 w-8 text-gray-400 hover:text-gray-900">
                   <ChevronRight className="h-4 w-4 rotate-180" />
                </Button>
             )}
             <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
               {pageTitle}
             </h2>
          </div>
          
          <div className="flex items-center gap-4">
             <LanguageSwitcher />
             <Button variant="ghost" size="icon" className="text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-all hover:scale-105">
               <Bell className="h-5 w-5" />
             </Button>
             
             <div className="h-8 w-px bg-gray-200 dark:bg-gray-800 mx-1"></div>

             <div className="flex items-center gap-4 pl-2">
               <div className="text-right hidden lg:block">
                 <p className="text-sm font-bold text-gray-900 dark:text-white leading-none">{profile?.full_name}</p>
                 <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">{profile?.email}</p>
               </div>
               
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-11 w-11 rounded-full p-0 overflow-hidden ring-2 ring-white dark:ring-gray-800 shadow-md hover:shadow-lg transition-all hover:scale-105">
                       <Avatar className="h-full w-full">
                          <AvatarFallback className="bg-gradient-to-tr from-primary to-indigo-500 text-white font-bold text-sm">
                            {profile?.initials || 'ME'}
                          </AvatarFallback>
                       </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 mt-2 rounded-2xl border-gray-100 dark:border-gray-800 shadow-xl p-2">
                    <div className="lg:hidden px-3 py-3 border-b border-gray-100 dark:border-gray-800 mb-1">
                      <p className="font-bold text-sm">{profile?.full_name}</p>
                      <p className="text-xs text-gray-500">{profile?.email}</p>
                    </div>
                    <DropdownMenuItem onClick={() => navigate('/profile')} className="rounded-xl cursor-pointer py-2.5 font-medium">
                      <User className="mr-2 h-4 w-4 text-gray-400" /> {t('common.profile')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={toggleTheme} className="rounded-xl cursor-pointer py-2.5 font-medium">
                      {theme === 'dark' ? <Sun className="mr-2 h-4 w-4 text-gray-400" /> : <Moon className="mr-2 h-4 w-4 text-gray-400" />}
                      {t('common.appearance')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1 bg-gray-100 dark:bg-gray-800" />
                    <DropdownMenuItem onClick={handleSignOut} className="rounded-xl cursor-pointer py-2.5 text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/10 font-medium">
                      <LogOut className="mr-2 h-4 w-4" /> {t('common.signOut')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
             </div>
          </div>
        </header>

        <div className={fullWidth ? "h-[calc(100vh-64px)] md:h-[calc(100vh-88px)]" : "px-3 py-4 sm:px-4 sm:py-6 md:px-8 md:py-8 max-w-[1600px] mx-auto pb-24 md:pb-12 w-full min-w-0"}>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
