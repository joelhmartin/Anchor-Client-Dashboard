import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// material-ui
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

// project imports
import useAuth from 'hooks/useAuth';
import useConfig from 'hooks/useConfig';
import MainCard from 'ui-component/cards/MainCard';
import Transitions from 'ui-component/extended/Transitions';

// assets
import { IconLogout, IconSettings, IconUser, IconForms } from '@tabler/icons-react';
import User1 from 'assets/images/users/user-round.svg';
import Favicon from '/favicon.svg';

// ==============================|| PROFILE MENU ||============================== //

export default function ProfileSection() {
  const theme = useTheme();
  const {
    state: { borderRadius }
  } = useConfig();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [sdm, setSdm] = useState(true);
  const [value, setValue] = useState('');
  const [notification, setNotification] = useState(false);
  const [open, setOpen] = useState(false);

  /**
   * anchorRef is used on different components and specifying one type leads to other components throwing an error
   * */
  const anchorRef = useRef(null);

  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  const handleClose = (event) => {
    if (anchorRef.current && anchorRef.current.contains(event.target)) {
      return;
    }

    setOpen(false);
  };

  const prevOpen = useRef(open);
  useEffect(() => {
    if (prevOpen.current === true && open === false) {
      anchorRef.current.focus();
    }

    prevOpen.current = open;
  }, [open]);

  return (
    <>
      <Chip
        slotProps={{ label: { sx: { lineHeight: 0 } } }}
        sx={{ ml: 2, height: '48px', alignItems: 'center', borderRadius: '27px' }}
        icon={
          <Avatar
            src={user?.avatar_url || Favicon}
            alt="user-images"
            sx={{ typography: 'mediumAvatar', margin: '8px 0 8px 8px !important', cursor: 'pointer' }}
            ref={anchorRef}
            aria-controls={open ? 'menu-list-grow' : undefined}
            aria-haspopup="true"
            color="inherit"
          />
        }
        label={<IconSettings stroke={1.5} size="24px" />}
        ref={anchorRef}
        aria-controls={open ? 'menu-list-grow' : undefined}
        aria-haspopup="true"
        onClick={handleToggle}
        color="primary"
        aria-label="user-account"
      />
      <Popper
        placement="bottom"
        open={open}
        anchorEl={anchorRef.current}
        role={undefined}
        transition
        disablePortal
        modifiers={[
          {
            name: 'offset',
            options: {
              offset: [0, 14]
            }
          }
        ]}
      >
        {({ TransitionProps }) => (
          <ClickAwayListener onClickAway={handleClose}>
            <Transitions in={open} {...TransitionProps}>
              <Paper>
                {open && (
                  <MainCard border={false} elevation={16} content={false} boxShadow shadow={theme.shadows[16]}>
                    <Box sx={{ p: 2, pb: 0 }}>
                      <Stack>
                        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="h4">{user ? `${user.first_name} ${user.last_name}` : 'Friend'}</Typography>
                        </Stack>
                        <Typography variant="subtitle2">Anchor Dashboard</Typography>
                      </Stack>
                      {/* <OutlinedInput
                        sx={{ width: '100%', pr: 1, pl: 2, my: 2 }}
                        id="input-search-profile"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="Search profile options"
                        startAdornment={
                          <InputAdornment position="start">
                            <IconSearch stroke={1.5} size="16px" />
                          </InputAdornment>
                        }
                        aria-describedby="search-helper-text"
                        slotProps={{ input: { 'aria-label': 'weight' } }}
                      /> */}
                      {/* <Divider /> */}
                    </Box>
                    <Box
                      sx={{
                        p: 2,
                        py: 0,
                        height: '100%',
                        maxHeight: 'calc(100vh - 250px)',
                        overflowX: 'hidden',
                        '&::-webkit-scrollbar': { width: 5 }
                      }}
                    >
                      {/* <UpgradePlanCard /> */}
                      <Divider />
                      <List
                        component="nav"
                        sx={{
                          width: '100%',
                          maxWidth: 350,
                          minWidth: 300,
                          borderRadius: `${borderRadius}px`,
                          '& .MuiListItemButton-root': { mt: 0.5 }
                        }}
                      >
                        {(() => {
                          const role = user?.effective_role || user?.role;
                          const inTasks = location.pathname.startsWith('/tasks');
                          const inForms = location.pathname.startsWith('/forms');
                          const canSeeTasks = role === 'superadmin' || role === 'admin' || role === 'team';
                          const canSeeHub = role === 'superadmin' || role === 'admin';
                          const canSeeForms = role === 'superadmin' || role === 'admin' || role === 'team';

                          const items = [];

                          // Task Manager / Client Hub toggle
                          const showTaskHub = inTasks ? canSeeHub : canSeeTasks;
                          if (showTaskHub && !inForms) {
                            const target = inTasks ? '/client-hub' : '/tasks';
                            const label = inTasks ? 'Client Hub' : 'Task Manager';
                            items.push(
                              <ListItemButton
                                key="task-hub"
                                onClick={(e) => {
                                  navigate(target);
                                  handleClose(e);
                                }}
                                sx={{ borderRadius: `${borderRadius}px` }}
                              >
                                <ListItemIcon>
                                  <IconSettings stroke={1.5} size="20px" />
                                </ListItemIcon>
                                <ListItemText primary={<Typography variant="body2">{label}</Typography>} />
                              </ListItemButton>
                            );
                          }

                          // Forms link (visible when not in /forms)
                          if (canSeeForms && !inForms) {
                            items.push(
                              <ListItemButton
                                key="forms"
                                onClick={(e) => {
                                  navigate('/forms');
                                  handleClose(e);
                                }}
                                sx={{ borderRadius: `${borderRadius}px` }}
                              >
                                <ListItemIcon>
                                  <IconForms stroke={1.5} size="20px" />
                                </ListItemIcon>
                                <ListItemText primary={<Typography variant="body2">Forms</Typography>} />
                              </ListItemButton>
                            );
                          }

                          // Back links when in Forms
                          if (inForms) {
                            if (canSeeTasks) {
                              items.push(
                                <ListItemButton
                                  key="tasks"
                                  onClick={(e) => {
                                    navigate('/tasks');
                                    handleClose(e);
                                  }}
                                  sx={{ borderRadius: `${borderRadius}px` }}
                                >
                                  <ListItemIcon>
                                    <IconSettings stroke={1.5} size="20px" />
                                  </ListItemIcon>
                                  <ListItemText primary={<Typography variant="body2">Task Manager</Typography>} />
                                </ListItemButton>
                              );
                            }
                            if (canSeeHub) {
                              items.push(
                                <ListItemButton
                                  key="hub"
                                  onClick={(e) => {
                                    navigate('/client-hub');
                                    handleClose(e);
                                  }}
                                  sx={{ borderRadius: `${borderRadius}px` }}
                                >
                                  <ListItemIcon>
                                    <IconSettings stroke={1.5} size="20px" />
                                  </ListItemIcon>
                                  <ListItemText primary={<Typography variant="body2">Client Hub</Typography>} />
                                </ListItemButton>
                              );
                            }
                          }

                          return items;
                        })()}
                        <ListItemButton
                          sx={{ borderRadius: `${borderRadius}px` }}
                          onClick={(e) => {
                            navigate('/portal?tab=profile');
                            handleClose(e);
                          }}
                        >
                          <ListItemIcon>
                            <IconSettings stroke={1.5} size="20px" />
                          </ListItemIcon>
                          <ListItemText primary={<Typography variant="body2">Profile Settings</Typography>} />
                        </ListItemButton>
                        <ListItemButton sx={{ borderRadius: `${borderRadius}px` }}>
                          <ListItemIcon>
                            <IconUser stroke={1.5} size="20px" />
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Stack direction="column" sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <Typography sx={{ fontWeight: 'bold' }} variant="body2">
                                  {user ? `${user.first_name} ${user.last_name}` : 'Profile'}
                                </Typography>
                                <Chip
                                  slotProps={{
                                    label: { sx: { mt: 0.25 } }
                                  }}
                                  sx={{ fontSize: '10px' }}
                                  label={user?.email || ''}
                                  variant="filled"
                                  size="small"
                                  color="warning"
                                />
                              </Stack>
                            }
                          />
                        </ListItemButton>
                        <ListItemButton
                          onClick={() => {
                            logout().finally(() => handleClose());
                          }}
                          sx={{ borderRadius: `${borderRadius}px` }}
                        >
                          <ListItemIcon>
                            <IconLogout stroke={1.5} size="20px" />
                          </ListItemIcon>
                          <ListItemText primary={<Typography variant="body2">Logout</Typography>} />
                        </ListItemButton>
                      </List>
                    </Box>
                  </MainCard>
                )}
              </Paper>
            </Transitions>
          </ClickAwayListener>
        )}
      </Popper>
    </>
  );
}
