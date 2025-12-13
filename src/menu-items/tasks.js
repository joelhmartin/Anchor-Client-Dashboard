import { IconLayoutBoard, IconUser, IconSettings } from '@tabler/icons-react';

export const tasksNavGroup = {
  id: 'tasks-nav-group',
  title: 'Tasks',
  type: 'group',
  children: [
    {
      id: 'tasks-home',
      title: 'Task Manager',
      type: 'item',
      url: '/tasks',
      icon: IconLayoutBoard
    },
    {
      id: 'profile-settings',
      title: 'Profile Settings',
      type: 'item',
      url: '/profile',
      icon: IconSettings
    },
    {
      id: 'client-hub',
      title: 'Back to Client Hub',
      type: 'item',
      url: '/client-hub',
      icon: IconUser
    }
  ]
};

const tasksMenu = {
  items: [tasksNavGroup]
};

export default tasksMenu;


