import { IconForms, IconHome, IconCode, IconListCheck, IconSettings } from '@tabler/icons-react';

function getPane(search = '') {
  try {
    const sp = new URLSearchParams(search || '');
    return sp.get('pane') || '';
  } catch {
    return '';
  }
}

export const formsNavGroup = {
  id: 'forms-nav-group',
  title: 'Forms',
  type: 'group',
  icon: IconForms,
  children: [
    {
      id: 'forms-home',
      title: 'Home',
      type: 'item',
      url: '/forms',
      icon: IconHome,
      isActive: ({ pathname, search }) => {
        if (!String(pathname || '').startsWith('/forms')) return false;
        const pane = getPane(search);
        return !pane || pane === 'home';
      }
    },
    {
      id: 'forms-builder',
      title: 'Builder',
      type: 'item',
      url: '/forms?pane=builder',
      icon: IconCode,
      isActive: ({ pathname, search }) => String(pathname || '').startsWith('/forms') && getPane(search) === 'builder'
    },
    {
      id: 'forms-submissions',
      title: 'Submissions',
      type: 'item',
      url: '/forms?pane=submissions',
      icon: IconListCheck,
      isActive: ({ pathname, search }) => String(pathname || '').startsWith('/forms') && getPane(search) === 'submissions'
    },
    {
      id: 'forms-settings',
      title: 'Settings',
      type: 'item',
      url: '/forms?pane=settings',
      icon: IconSettings,
      isActive: ({ pathname, search }) => String(pathname || '').startsWith('/forms') && getPane(search) === 'settings'
    }
  ]
};

const formsMenu = {
  items: [formsNavGroup]
};

export default formsMenu;

