import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';

import MainCard from 'ui-component/cards/MainCard';
import { archiveActiveClient, fetchActiveClients, redactOldServices } from 'api/services';
import { fetchProfile } from 'api/profile';
import Button from '@mui/material/Button';

function ActiveClientRow({ client, onArchive }) {
  const [open, setOpen] = useState(false);

  const activeServices = client.services?.filter((s) => !s.redacted_at) || [];
  const historicalServices = client.services?.filter((s) => s.redacted_at) || [];
  const totalRevenue = client.services?.reduce((sum, s) => sum + (parseFloat(s.agreed_price) || 0), 0) || 0;
  const journeySummary = client.journey_id
    ? {
        id: client.journey_id,
        status: client.journey_status,
        paused: client.journey_paused,
        concerns: Array.isArray(client.journey_symptoms) ? client.journey_symptoms : [],
        next_action_at: client.journey_next_action_at
      }
    : null;
  const journeyConcerns = journeySummary?.concerns || [];

  return (
    <>
      <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
        <TableCell>
          <IconButton size="small" onClick={() => setOpen(!open)}>
            {open ? <IconChevronUp /> : <IconChevronDown />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar alt={client.client_name}>
              {client.client_name?.[0] || '?'}
            </Avatar>
            <Box>
              <Typography variant="subtitle2">
                {client.client_name || 'Unknown'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {client.client_phone || client.client_email || 'No contact info'}
              </Typography>
            </Box>
          </Stack>
        </TableCell>
        <TableCell>
          {activeServices.length > 0 ? (
            <Stack direction="row" spacing={0.5} flexWrap="wrap">
              {activeServices.map((s) => (
                <Chip key={s.id} label={s.service_name} size="small" color="primary" />
              ))}
            </Stack>
          ) : (
            <Typography variant="caption" color="text.secondary">
              No active services
            </Typography>
          )}
        </TableCell>
        <TableCell>
          {journeySummary ? (
            <Stack spacing={0.5}>
              <Chip
                label={(journeySummary.status || 'pending').replace(/_/g, ' ')}
                size="small"
                color={journeySummary.paused ? 'warning' : 'success'}
              />
              {journeyConcerns.length > 0 && (
                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                  {journeyConcerns.slice(0, 3).map((concern) => (
                    <Chip key={`${client.id}-${concern}`} label={concern} size="small" variant="outlined" />
                  ))}
                  {journeyConcerns.length > 3 && (
                    <Chip size="small" variant="outlined" label={`+${journeyConcerns.length - 3}`} />
                  )}
                </Stack>
              )}
            </Stack>
          ) : (
            <Typography variant="caption" color="text.secondary">
              —
            </Typography>
          )}
        </TableCell>
        <TableCell>
          <Typography variant="body2" color="text.secondary">
            {client.source || '—'}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="subtitle2">${totalRevenue.toFixed(2)}</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" color="text.secondary">
            {new Date(client.agreed_date).toLocaleDateString()}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Button size="small" color="error" onClick={() => onArchive(client)}>
            Archive
          </Button>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 2 }}>
              <Typography variant="h6" gutterBottom>
                Service Details
              </Typography>
              {activeServices.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="primary" gutterBottom>
                    Active Services
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Service</TableCell>
                        <TableCell align="right">Price</TableCell>
                        <TableCell>Agreed Date</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {activeServices.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{s.service_name}</TableCell>
                          <TableCell align="right">${parseFloat(s.agreed_price || 0).toFixed(2)}</TableCell>
                          <TableCell>{new Date(s.agreed_date).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
              {historicalServices.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Historical Services (Revenue Retained)
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Service (Redacted)</TableCell>
                        <TableCell align="right">Price</TableCell>
                        <TableCell>Agreed Date</TableCell>
                        <TableCell>Redacted Date</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {historicalServices.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                            {s.service_name || 'Redacted'}
                          </TableCell>
                          <TableCell align="right">${parseFloat(s.agreed_price || 0).toFixed(2)}</TableCell>
                          <TableCell>{new Date(s.agreed_date).toLocaleDateString()}</TableCell>
                          <TableCell>{new Date(s.redacted_at).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
              {client.funnel_data && Object.keys(client.funnel_data).length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Funnel Data
                  </Typography>
                  <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(client.funnel_data, null, 2)}
                  </Typography>
                </Box>
              )}
              {journeySummary && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2">Client Journey</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Status: {(journeySummary.status || 'pending').replace(/_/g, ' ')}
                    {journeySummary.next_action_at && ` · Next action ${new Date(journeySummary.next_action_at).toLocaleString()}`}
                  </Typography>
                  {journeyConcerns.length > 0 && (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
                      {journeyConcerns.map((concern) => (
                        <Chip key={`${client.id}-detail-${concern}`} label={concern} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  )}
                </Box>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function ActiveClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [monthlyGoal, setMonthlyGoal] = useState(null);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchActiveClients();
      setClients(data);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Unable to load active clients' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const profile = await fetchProfile();
      setMonthlyGoal(profile.monthly_revenue_goal ? parseFloat(profile.monthly_revenue_goal) : null);
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  }, []);

  useEffect(() => {
    loadClients();
    loadProfile();
  }, [loadClients, loadProfile]);

  const handleRedactOldServices = async () => {
    if (!window.confirm('Redact all services older than 90 days? This will preserve revenue data but hide service details.')) {
      return;
    }
    try {
      setLoading(true);
      const result = await redactOldServices();
      setMessage({
        type: 'success',
        text: `Successfully redacted ${result.redacted_count} service(s)`
      });
      await loadClients();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Unable to redact services' });
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveClient = useCallback(
    async (client) => {
      if (!client?.id) return;
      const label = client.client_name || client.client_email || 'this client';
      if (!window.confirm(`Move ${label} to the archive? They can be restored later.`)) {
        return;
      }
      try {
        setLoading(true);
        await archiveActiveClient(client.id);
        setMessage({ type: 'success', text: `${label} archived` });
        await loadClients();
      } catch (err) {
        setMessage({ type: 'error', text: err.message || 'Unable to archive client' });
      } finally {
        setLoading(false);
      }
    },
    [loadClients]
  );

  const totalRevenue = clients.reduce((sum, client) => {
    const clientRevenue = client.services?.reduce((s, srv) => s + (parseFloat(srv.agreed_price) || 0), 0) || 0;
    return sum + clientRevenue;
  }, 0);

  // Calculate current month's revenue (clients added this month)
  const currentMonth = new Date();
  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const monthlyRevenue = clients.reduce((sum, client) => {
    const agreedDate = new Date(client.agreed_date);
    if (agreedDate >= monthStart) {
      const clientRevenue = client.services?.reduce((s, srv) => s + (parseFloat(srv.agreed_price) || 0), 0) || 0;
      return sum + clientRevenue;
    }
    return sum;
  }, 0);

  const goalProgress = monthlyGoal && monthlyGoal > 0 ? (monthlyRevenue / monthlyGoal) * 100 : 0;

  return (
    <MainCard
      title="My Active Clients"
      secondary={
        <Button variant="outlined" onClick={handleRedactOldServices}>
          Redact Old Services
        </Button>
      }
    >
      <Stack spacing={3}>
        {message.text && <Alert severity={message.type === 'error' ? 'error' : 'success'}>{message.text}</Alert>}

        {/* Monthly Revenue Goal Progress */}
        {monthlyGoal && (
          <Box sx={{ p: 3, bgcolor: 'primary.lighter', borderRadius: 2 }}>
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h5">Monthly Revenue Goal</Typography>
                <Typography variant="h4" color="primary">
                  ${monthlyRevenue.toFixed(2)} / ${monthlyGoal.toFixed(2)}
                </Typography>
              </Stack>
              <Box sx={{ position: 'relative' }}>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(goalProgress, 100)}
                  sx={{
                    height: 20,
                    borderRadius: 1,
                    bgcolor: 'grey.200',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: goalProgress >= 100 ? 'success.main' : 'primary.main'
                    }
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontWeight: 'bold',
                    color: goalProgress > 50 ? 'white' : 'text.primary'
                  }}
                >
                  {goalProgress.toFixed(1)}%
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Revenue from clients added this month ({currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })})
              </Typography>
            </Stack>
          </Box>
        )}

        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="h6" color="primary">
            Total All-Time Revenue: ${totalRevenue.toFixed(2)}
          </Typography>
        </Stack>

        {loading && !clients.length && <LinearProgress />}

        {clients.length === 0 && !loading ? (
          <Typography variant="body2" color="text.secondary">
            No active clients yet.
          </Typography>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell>Client</TableCell>
                  <TableCell>Active Services</TableCell>
                  <TableCell>Journey</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell align="right">Total Revenue</TableCell>
                  <TableCell>Client Since</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clients.map((client) => (
                  <ActiveClientRow key={client.id} client={client} onArchive={handleArchiveClient} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>
    </MainCard>
  );
}
