import PropTypes from 'prop-types';

import { useTheme } from '@mui/material/styles';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

import { withAlpha } from 'utils/colorUtils';
import { IconBell } from '@tabler/icons-react';

function ListItemWrapper({ children, onClick }) {
  const theme = useTheme();

  return (
    <Box
      onClick={onClick}
      sx={{
        p: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
        cursor: 'pointer',
        '&:hover': {
          bgcolor: withAlpha(theme.palette.grey[200], 0.3)
        }
      }}
    >
      {children}
    </Box>
  );
}

function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

export default function NotificationList({ notifications = [], onSelect, loading }) {
  if (loading) {
    return (
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (!notifications.length) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          You&apos;re all caught up!
        </Typography>
      </Box>
    );
  }

  return (
    <List sx={{ width: '100%', maxWidth: { xs: 300, md: 330 }, py: 0 }}>
      {notifications.map((notification) => (
        <ListItemWrapper key={notification.id} onClick={() => onSelect?.(notification)}>
          <ListItem
            alignItems="center"
            disablePadding
            secondaryAction={
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                <Typography variant="caption">{formatTimestamp(notification.created_at)}</Typography>
              </Stack>
            }
          >
            <ListItemAvatar>
              <Avatar
                sx={{
                  color: 'primary.dark',
                  bgcolor: 'primary.light'
                }}
              >
                <IconBell stroke={1.5} size="20px" />
              </Avatar>
            </ListItemAvatar>
            <ListItemText primary={<Typography variant="subtitle1">{notification.title}</Typography>} />
          </ListItem>
          <Stack sx={{ gap: 1.5, pl: 7, pt: 1 }}>
            {notification.body && (
              <Typography variant="subtitle2" color="text.secondary">
                {notification.body}
              </Typography>
            )}
            {notification.status !== 'read' && (
              <Chip label="Unread" color="error" size="small" sx={{ width: 'min-content' }} />
            )}
          </Stack>
        </ListItemWrapper>
      ))}
    </List>
  );
}

NotificationList.propTypes = {
  loading: PropTypes.bool,
  notifications: PropTypes.array,
  onSelect: PropTypes.func
};

ListItemWrapper.propTypes = { children: PropTypes.node, onClick: PropTypes.func };
