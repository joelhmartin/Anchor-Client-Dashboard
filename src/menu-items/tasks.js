import { IconHome, IconChecklist, IconBolt, IconReceipt } from '@tabler/icons-react';

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
      icon: IconHome
    },
    {
      id: 'tasks-my-work',
      title: 'My Work',
      type: 'item',
      url: '/tasks?pane=my-work',
      icon: IconChecklist
    },
    {
      id: 'tasks-automations',
      title: 'Automations',
      type: 'item',
      url: '/tasks?pane=automations',
      icon: IconBolt
    },
    {
      id: 'tasks-billing',
      title: 'Billing',
      type: 'item',
      url: '/tasks?pane=billing',
      icon: IconReceipt
    }
  ]
};

const tasksMenu = {
  items: [tasksNavGroup]
};

export default tasksMenu;


