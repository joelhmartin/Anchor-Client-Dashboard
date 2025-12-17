import { IconHome, IconChecklist, IconBolt, IconReceipt } from '@tabler/icons-react';

function getPane(search = '') {
  try {
    const sp = new URLSearchParams(search || '');
    return sp.get('pane') || '';
  } catch {
    return '';
  }
}

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
      icon: IconHome,
      isActive: ({ pathname, search }) => {
        if (!String(pathname || '').startsWith('/tasks')) return false;
        const pane = getPane(search);
        return !pane || pane === 'home';
      }
    },
    {
      id: 'tasks-my-work',
      title: 'My Work',
      type: 'item',
      url: '/tasks?pane=my-work',
      icon: IconChecklist,
      isActive: ({ pathname, search }) => String(pathname || '').startsWith('/tasks') && getPane(search) === 'my-work'
    },
    {
      id: 'tasks-automations',
      title: 'Automations',
      type: 'item',
      url: '/tasks?pane=automations',
      icon: IconBolt,
      isActive: ({ pathname, search }) => String(pathname || '').startsWith('/tasks') && getPane(search) === 'automations'
    },
    {
      id: 'tasks-billing',
      title: 'Billing',
      type: 'item',
      url: '/tasks?pane=billing',
      icon: IconReceipt,
      isActive: ({ pathname, search }) => String(pathname || '').startsWith('/tasks') && getPane(search) === 'billing'
    }
  ]
};

const tasksMenu = {
  items: [tasksNavGroup]
};

export default tasksMenu;


