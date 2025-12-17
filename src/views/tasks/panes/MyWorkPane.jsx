import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import BoardTable from '../components/BoardTable';

// Default status labels for My Work (since items come from multiple boards)
const DEFAULT_STATUS_LABELS = [
  { id: 'default-todo', label: 'To Do', color: '#808080', order_index: 0, is_done_state: false },
  { id: 'default-working', label: 'Working on it', color: '#fdab3d', order_index: 1, is_done_state: false },
  { id: 'default-stuck', label: 'Stuck', color: '#e2445c', order_index: 2, is_done_state: false },
  { id: 'default-done', label: 'Done', color: '#00c875', order_index: 3, is_done_state: true },
  { id: 'default-needs-attention', label: 'Needs Attention', color: '#ff642e', order_index: 4, is_done_state: false }
];

export default function MyWorkPane({
  loading,
  groups,
  itemsByGroup,
  assigneesByItem,
  updateCountsByItem,
  timeTotalsByItem,
  workspaceMembers,
  onUpdateItem,
  onToggleAssignee,
  onClickItem
}) {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, minHeight: 420 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Stack spacing={0.25}>
            <Typography variant="h5">My Work</Typography>
            <Typography variant="caption" color="text.secondary">
              Items assigned to you across all boards
            </Typography>
          </Stack>
          {loading && <CircularProgress size={18} />}
        </Stack>

        {!loading && groups.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No assigned items yet.
          </Typography>
        )}

        {!loading && groups.length > 0 && (
          <BoardTable
            groups={groups}
            itemsByGroup={itemsByGroup}
            assigneesByItem={assigneesByItem}
            workspaceMembers={workspaceMembers}
            updateCountsByItem={updateCountsByItem}
            timeTotalsByItem={timeTotalsByItem}
            statusLabels={DEFAULT_STATUS_LABELS}
            onUpdateItem={onUpdateItem}
            onToggleAssignee={onToggleAssignee}
            onClickItem={onClickItem}
            // disable creation in My Work
            onCreateItem={null}
            onChangeNewItemName={null}
            newItemNameByGroup={{}}
            creatingItemByGroup={{}}
          />
        )}
      </Stack>
    </Box>
  );
}
