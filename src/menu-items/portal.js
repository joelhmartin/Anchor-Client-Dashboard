import {
  IconUser,
  IconChartInfographic,
  IconStack2,
  IconPhoneCalling,
  IconBrush,
  IconFolder,
  IconFlagCheck,
  IconBriefcase,
  IconUsers,
  IconArticle,
  IconArchive,
  IconStar
} from '@tabler/icons-react';

const portalGroup = {
  id: 'portal-nav-group',
  title: 'Client Portal',
  type: 'group',
  children: [
    {
      id: 'portal-profile',
      title: 'Profile',
      type: 'item',
      url: '/portal?tab=profile',
      icon: IconUser
    },
    {
      id: 'portal-analytics',
      title: 'Analytics',
      type: 'item',
      url: '/portal?tab=analytics',
      icon: IconChartInfographic
    },
    {
      id: 'portal-brand',
      title: 'Brand Assets',
      type: 'item',
      url: '/portal?tab=brand',
      icon: IconBrush
    },
    {
      id: 'portal-services',
      title: 'Services',
      type: 'item',
      url: '/services',
      icon: IconBriefcase
    },
    {
      id: 'portal-documents',
      title: 'Documents',
      type: 'item',
      url: '/portal?tab=documents',
      icon: IconFolder
    },
    {
      id: 'portal-reviews',
      title: 'Reviews',
      type: 'item',
      url: '/portal?tab=reviews',
      icon: IconStar
    }
  ]
};

const clientManagementGroup = {
  id: 'client-management-group',
  title: 'My Clients',
  type: 'group',
  children: [
    {
      id: 'portal-leads',
      title: 'Leads',
      type: 'item',
      url: '/portal?tab=leads',
      icon: IconPhoneCalling
    },
    {
      id: 'portal-journey',
      title: 'Client Journey',
      type: 'item',
      url: '/portal?tab=journey',
      icon: IconFlagCheck
    },
    {
      id: 'portal-archive',
      title: 'Archive',
      type: 'item',
      url: '/portal?tab=archive',
      icon: IconArchive
    },
    {
      id: 'active-clients',
      title: 'Active Clients',
      type: 'item',
      url: '/active-clients',
      icon: IconUsers
    }
  ]
};

const contentGroup = {
  id: 'content-group',
  title: 'My Content',
  type: 'group',
  children: [
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
  items: [portalGroup, clientManagementGroup, contentGroup]
};

export default portalMenu;
