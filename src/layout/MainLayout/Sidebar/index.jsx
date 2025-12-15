import { memo, useMemo } from 'react';

import useMediaQuery from '@mui/material/useMediaQuery';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';

// project imports
import MenuCard from './MenuCard';
import MenuList from '../MenuList';
import LogoSection from '../LogoSection';
import MiniDrawerStyled from './MiniDrawerStyled';

import useConfig from 'hooks/useConfig';
import { drawerWidth } from 'store/constant';
import SimpleBar from 'ui-component/third-party/SimpleBar';

import { handlerDrawerOpen, useGetMenuMaster } from 'api/menu';
import useAuth from 'hooks/useAuth';
import { useLocation } from 'react-router-dom';
import portalMenu from 'menu-items/portal';
import tasksMenu from 'menu-items/tasks';
import TaskSidebarPanel from './TaskSidebarPanel';

// ==============================|| SIDEBAR DRAWER ||============================== //

function Sidebar() {
  const downMD = useMediaQuery((theme) => theme.breakpoints.down('md'));

  const { menuMaster } = useGetMenuMaster();
  const drawerOpen = menuMaster.isDashboardDrawerOpened;
  const { user, actingClientId } = useAuth();
  const location = useLocation();
  
  // Use portal menu for regular clients or when admin is viewing portal
  const isPortal = user?.role === 'client' || Boolean(actingClientId) || location.pathname.startsWith('/portal');
  const isTasks = location.pathname.startsWith('/tasks');

  const {
    state: { miniDrawer }
  } = useConfig();

  const logo = useMemo(
    () => (
      <Box sx={{ display: 'flex', p: 2 }}>
        <LogoSection />
      </Box>
    ),
    []
  );

  const drawer = useMemo(() => {
    const drawerContent = !isPortal ? (
      <>
        {isTasks ? (
          <TaskSidebarPanel />
        ) : (
          <>
            <MenuCard />
            <Stack direction="row" sx={{ justifyContent: 'center', mb: 2 }}>
              <Chip label={import.meta.env.VITE_APP_VERSION} size="small" color="default" />
            </Stack>
          </>
        )}
      </>
    ) : null;

    let drawerSX = { paddingLeft: '0px', paddingRight: '0px', marginTop: '20px' };
    if (drawerOpen) drawerSX = { paddingLeft: '16px', paddingRight: '16px', marginTop: '0px' };

    return (
      <>
        {downMD ? (
          <Box sx={drawerSX}>
            <MenuList menuConfig={isPortal ? portalMenu : isTasks ? tasksMenu : undefined} />
            {drawerOpen && drawerContent}
          </Box>
        ) : (
          <SimpleBar sx={{ height: 'calc(100vh - 90px)', ...drawerSX }}>
            <MenuList menuConfig={isPortal ? portalMenu : isTasks ? tasksMenu : undefined} />
            {drawerOpen && drawerContent}
          </SimpleBar>
        )}
      </>
    );
  }, [downMD, drawerOpen, isPortal, isTasks]);

  return (
    <Box component="nav" sx={{ flexShrink: { md: 0 }, width: { xs: 'auto', md: drawerWidth } }} aria-label="mailbox folders">
      {downMD || (miniDrawer && drawerOpen) ? (
        <Drawer
          variant={downMD ? 'temporary' : 'persistent'}
          anchor="left"
          open={drawerOpen}
          onClose={() => handlerDrawerOpen(!drawerOpen)}
          slotProps={{
            paper: {
              sx: {
                mt: downMD ? 0 : 11,
                zIndex: 1099,
                width: drawerWidth,
                bgcolor: 'background.default',
                color: 'text.primary',
                borderRight: 'none'
              }
            }
          }}
          ModalProps={{ keepMounted: true }}
          color="inherit"
        >
          {downMD && logo}
          {drawer}
        </Drawer>
      ) : (
        <MiniDrawerStyled variant="permanent" open={drawerOpen}>
          {logo}
          {drawer}
        </MiniDrawerStyled>
      )}
    </Box>
  );
}

export default memo(Sidebar);
