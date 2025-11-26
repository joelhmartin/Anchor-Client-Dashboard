import {
  IconUser,
  IconChartInfographic,
  IconStack2,
  IconPhoneCalling,
  IconBrush,
  IconFolder,
  IconBriefcase,
  IconUsers,
  IconArticle
} from '@tabler/icons-react';

const portalTabs = [
  { value: 'profile', label: 'Profile', icon: IconUser },
  { value: 'analytics', label: 'Analytics', icon: IconChartInfographic },
  { value: 'tasks', label: 'Tasks', icon: IconStack2 },
  { value: 'leads', label: 'Leads', icon: IconPhoneCalling },
  { value: 'brand', label: 'Brand Assets', icon: IconBrush },
  { value: 'documents', label: 'Documents', icon: IconFolder }
];

const portalGroup = {
  id: 'portal-nav-group',
  title: 'Client Portal',
  type: 'group',
  children: portalTabs.map(({ value, label, icon }) => ({
    id: `portal-${value}`,
    title: label,
    type: 'item',
    url: `/portal?tab=${value}`,
    icon,
    isActive: ({ search, pathname }) => {
      if (pathname !== '/portal') return false;
      const params = new URLSearchParams(search);
      const tabValue = params.get('tab') || 'profile';
      return tabValue === value;
    }
  }))
};

const clientManagementGroup = {
  id: 'client-management-group',
  title: 'My Clients',
  type: 'group',
  children: [
    {
      id: 'active-clients',
      title: 'Active Clients',
      type: 'item',
      url: '/active-clients',
      icon: IconUsers
    },
    {
      id: 'services',
      title: 'Services',
      type: 'item',
      url: '/services',
      icon: IconBriefcase
    },
    {
      id: 'blogs',
      title: 'Blog Posts',
      type: 'item',
      url: '/blogs',
      icon: IconArticle
    }
  ]
};

const portalMenu = {
  items: [portalGroup, clientManagementGroup]
};

export default portalMenu;
