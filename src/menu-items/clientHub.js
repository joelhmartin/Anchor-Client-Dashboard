import { IconUser, IconChartArcs, IconSettings, IconBriefcase, IconUsers, IconFiles } from '@tabler/icons-react';

export const adminNavGroup = {
  id: 'admin-nav-group',
  title: 'Administration',
  type: 'group',
  children: [
    {
      id: 'client-hub',
      title: 'Client Hub',
      type: 'item',
      url: '/client-hub',
      icon: IconUser
    },
    {
      id: 'shared-documents',
      title: 'Shared Documents',
      type: 'item',
      url: '/shared-documents',
      icon: IconFiles
    },
    {
      id: 'jump-client',
      title: 'Jump to Client View',
      type: 'item',
      url: '/client-view',
      icon: IconChartArcs
    },
    {
      id: 'profile-settings',
      title: 'Profile Settings',
      type: 'item',
      url: '/profile',
      icon: IconSettings
    }
  ]
};

export const clientManagementGroup = {
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
    }
  ]
};
