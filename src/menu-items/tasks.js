import { IconLayoutBoard, IconReportAnalytics, IconUserCheck } from '@tabler/icons-react';

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
      id: 'tasks-my-work',
      title: 'My Work',
      type: 'item',
      url: '/tasks?pane=my-work',
      icon: IconUserCheck
    },
    {
      id: 'tasks-reporting',
      title: 'Reporting',
      type: 'item',
      url: '/tasks?pane=reports',
      icon: IconReportAnalytics
    }
  ]
};

const tasksMenu = {
  items: [tasksNavGroup]
};

export default tasksMenu;


