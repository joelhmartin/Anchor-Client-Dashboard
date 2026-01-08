import { FormControlLabel, Link, List, ListItem, ListItemText, Paper, RadioGroup, Stack, Typography } from '@mui/material';
import CheckboxRadio from './CheckboxRadio';

export default function WebsiteAccessStep({ access, setAccessStatus }) {
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Website Access</Typography>
      <Typography variant="body2" color="text.secondary">
        We need <strong>Admin access</strong> to your website platform so we can manage updates, tracking, integrations, performance optimization,
        and ongoing support.
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2">This may include</Typography>
        <List dense>
          {[
            'WordPress admin access (preferred)',
            'Hosting provider access (Kinsta, WP Engine, etc.)',
            'DNS access (if required)',
            'FTP or SFTP access (if applicable)'
          ].map((t) => (
            <ListItem key={t} sx={{ pl: 0 }}>
              <ListItemText primary={t} />
            </ListItem>
          ))}
        </List>
        <Typography variant="subtitle2" sx={{ mt: 1 }}>
          How to grant access
        </Typography>
        <Stack spacing={0.5}>
          <Link href="https://wordpress.com/support/invite-people/" target="_blank" rel="noreferrer">
            WordPress: invite people to your site
          </Link>
          <Link href="https://www.godaddy.com/help/invite-a-delegate-to-access-my-godaddy-account-12376" target="_blank" rel="noreferrer">
            GoDaddy: invite a delegate to access your account
          </Link>
        </Stack>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Add: <strong>access@anchorcorps.com</strong> (Admin access)
        </Typography>
      </Paper>
      <RadioGroup
        value={access.website_access_status}
        onChange={(_e, v) =>
          setAccessStatus('website_access_status', v, (val) => ({
            website_access_provided: val === 'provided',
            website_access_understood: val === 'will_provide'
          }))
        }
      >
        <FormControlLabel value="provided" control={<CheckboxRadio />} label="I have provided access" />
        <FormControlLabel
          value="will_provide"
          control={<CheckboxRadio />}
          label="I have access and will be providing to Anchor Corps as soon as possible to ensure a smooth onboarding"
        />
        <FormControlLabel
          value="need_help"
          control={<CheckboxRadio />}
          label="Please help! I don’t know who has administrative access to my website account"
        />
      </RadioGroup>
    </Stack>
  );
}


