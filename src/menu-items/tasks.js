import { IconLayoutBoard } from '@tabler/icons-react';

export const tasksNavGroup = {
  id: 'tasks-nav-group',
  title: 'Tasks',
  type: 'group',
  children: [
    {
      id: 'tasks-home',
      title: 'Home',
      type: 'item',
      url: '/tasks',
      icon: IconLayoutBoard
    },
    {
      id: 'tasks-my-work',
      title: 'My Work',
      type: 'item',
      url: '/tasks?pane=my-work',
      icon: IconLayoutBoard
    },
    {
      id: 'tasks-automations',
      title: 'Automations',
      type: 'item',
      url: '/tasks?pane=automations',
      icon: IconLayoutBoard
    },
    {
      id: 'tasks-billing',
      title: 'Billing',
      type: 'item',
      url: '/tasks?pane=billing',
      icon: IconLayoutBoard
    }
  ]
};

const tasksMenu = {
  items: [tasksNavGroup]
};

export default tasksMenu;


