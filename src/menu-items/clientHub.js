import { IconUser, IconChartArcs } from '@tabler/icons-react';

const clientHub = {
  id: 'client-hub-group',
  title: 'Navigation',
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
      id: 'jump-client',
      title: 'Jump to Client View',
      type: 'item',
      url: '/client-view',
      icon: IconChartArcs
    }
  ]
};

export default clientHub;
