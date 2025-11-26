import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';

import MainCard from 'ui-component/cards/MainCard';
import { 
  fetchBlogPosts, 
  fetchBlogPost, 
  createBlogPost, 
  updateBlogPost, 
  deleteBlogPost,
  generateBlogIdeas,
  generateBlogDraft
} from 'api/blogs';

export default function BlogEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editorRef = useRef(null);
  const editingId = searchParams.get('id');

  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editor state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('draft');

  // Blog list
  const [blogPosts, setBlogPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // AI Assistant
  const [aiIdeas, setAiIdeas] = useState([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);

  // Delete confirmation
  const [deleteDialog, setDeleteDialog] = useState({ open: false, post: null });

  const triggerMessage = (type, text) => setMessage({ type, text });

  useEffect(() => {
    if (editorRef.current && editorRef.current.getData() !== content) {
      editorRef.current.setData(content);
    }
  }, [content]);

  const loadBlogPosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const posts = await fetchBlogPosts();
      setBlogPosts(posts);
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to load blog posts');
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  const loadBlogPost = useCallback(async (id) => {
    setLoading(true);
    try {
      const post = await fetchBlogPost(id);
      setTitle(post.title);
      setContent(post.content);
      setStatus(post.status);
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to load blog post');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBlogPosts();
    if (editingId) {
      loadBlogPost(editingId);
    }
  }, [editingId, loadBlogPosts, loadBlogPost]);

  const handleSave = async (newStatus = status) => {
    if (!title.trim()) {
      triggerMessage('error', 'Title is required');
      return;
    }
    if (!content.trim()) {
      triggerMessage('error', 'Content is required');
      return;
    }

    setSaving(true);
    try {
      const data = { title, content, status: newStatus };
      if (editingId) {
        await updateBlogPost(editingId, data);
        triggerMessage('success', 'Blog post updated');
      } else {
        const newPost = await createBlogPost(data);
        navigate(`/blogs?id=${newPost.id}`, { replace: true });
        triggerMessage('success', 'Blog post created');
      }
      setStatus(newStatus);
      loadBlogPosts();
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to save blog post');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = () => handleSave('published');

  const handleDelete = async () => {
    const { post } = deleteDialog;
    if (!post) return;

    try {
      await deleteBlogPost(post.id);
      triggerMessage('success', 'Blog post deleted');
      setDeleteDialog({ open: false, post: null });
      loadBlogPosts();
      if (editingId === post.id) {
        navigate('/blogs', { replace: true });
        setTitle('');
        setContent('');
        setStatus('draft');
      }
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to delete blog post');
    }
  };

  const handleNewPost = () => {
    navigate('/blogs', { replace: true });
    setTitle('');
    setContent('');
    setStatus('draft');
  };

  const handleGenerateIdeas = async () => {
    setLoadingIdeas(true);
    try {
      const ideas = await generateBlogIdeas();
      setAiIdeas(ideas);
      triggerMessage('success', `Generated ${ideas.length} blog post ideas`);
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to generate ideas');
    } finally {
      setLoadingIdeas(false);
    }
  };

  const handleWriteDraft = async (ideaTitle) => {
    setGeneratingDraft(true);
    try {
      const draftContent = await generateBlogDraft(ideaTitle);
      setTitle(ideaTitle);
      setContent(draftContent);
      triggerMessage('success', 'Draft generated! You can now edit and save it.');
    } catch (err) {
      triggerMessage('error', err.message || 'Unable to generate draft');
    } finally {
      setGeneratingDraft(false);
    }
  };

  return (
    <MainCard title="Blog Editor">
      <Grid container spacing={3}>
        {/* Editor Section - 2/3 width */}
        <Grid item xs={12} md={8}>
          <Stack spacing={2}>
            {message.text && <Alert severity={message.type === 'error' ? 'error' : 'success'}>{message.text}</Alert>}
            
            {loading && <LinearProgress />}

            <Stack direction="row" spacing={2} alignItems="center">
              <Button variant="outlined" onClick={handleNewPost}>
                New Post
              </Button>
              <Button 
                variant="contained" 
                startIcon={<SaveIcon />}
                onClick={() => handleSave()}
                disabled={saving || loading}
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </Button>
              <Button 
                variant="contained" 
                color="success"
                onClick={handlePublish}
                disabled={saving || loading}
              >
                {status === 'published' ? 'Update & Publish' : 'Publish'}
              </Button>
              {status === 'published' && (
                <Chip label="Published" color="success" size="small" />
              )}
            </Stack>

            <TextField
              label="Blog Post Title"
              fullWidth
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
            />

            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                '& .ck-editor__editable_inline': { minHeight: 600 }
              }}
            >
              <CKEditor
                key={editingId || 'new'}
                editor={ClassicEditor}
                data={content}
                config={{
                  toolbar: [
                    'heading',
                    '|',
                    'bold',
                    'italic',
                    'link',
                    'bulletedList',
                    'numberedList',
                    'blockQuote',
                    '|',
                    'insertTable',
                    'undo',
                    'redo'
                  ]
                }}
                onReady={(editor) => {
                  editorRef.current = editor;
                  editor.setData(content);
                }}
                onChange={(_, editor) => {
                  const data = editor.getData();
                  setContent(data);
                }}
              />
            </Box>
          </Stack>
        </Grid>

        {/* AI Assistant & Blog List - 1/3 width */}
        <Grid item xs={12} md={4}>
          <Stack spacing={3}>
            {/* AI Assistant */}
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <AutoAwesomeIcon color="primary" />
                    <Typography variant="h6">AI Assistant</Typography>
                  </Stack>
                  
                  <Button 
                    variant="contained" 
                    fullWidth
                    onClick={handleGenerateIdeas}
                    disabled={loadingIdeas}
                  >
                    {loadingIdeas ? 'Generating...' : 'Suggest Content'}
                  </Button>

                  {generatingDraft && (
                    <Box>
                      <LinearProgress />
                      <Typography variant="caption" sx={{ mt: 1 }}>
                        Generating draft... This may take a minute.
                      </Typography>
                    </Box>
                  )}

                  {aiIdeas.length > 0 && (
                    <>
                      <Divider />
                      <Typography variant="subtitle2">Blog Post Ideas:</Typography>
                      <List dense>
                        {aiIdeas.map((idea, index) => (
                          <ListItemButton
                            key={index}
                            onClick={() => handleWriteDraft(idea)}
                            disabled={generatingDraft}
                            sx={{ 
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              mb: 1
                            }}
                          >
                            <ListItemText 
                              primary={idea}
                              secondary="Click to write draft"
                            />
                          </ListItemButton>
                        ))}
                      </List>
                    </>
                  )}
                </Stack>
              </CardContent>
            </Card>

            {/* Blog Posts List */}
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>Your Blog Posts</Typography>
                {loadingPosts && <LinearProgress />}
                <List dense>
                  {blogPosts.map((post) => (
                    <Card 
                      key={post.id} 
                      variant="outlined" 
                      sx={{ 
                        mb: 1,
                        bgcolor: editingId === post.id ? 'action.selected' : 'transparent'
                      }}
                    >
                      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                        <Stack spacing={1}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="subtitle2" sx={{ flex: 1 }}>
                              {post.title}
                            </Typography>
                            <Chip 
                              label={post.status} 
                              size="small"
                              color={post.status === 'published' ? 'success' : 'default'}
                            />
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(post.updated_at).toLocaleDateString()}
                          </Typography>
                          <Stack direction="row" spacing={1}>
                            <IconButton 
                              size="small"
                              onClick={() => navigate(`/blogs?id=${post.id}`)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton 
                              size="small"
                              onClick={() => setDeleteDialog({ open: true, post })}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                  {!blogPosts.length && !loadingPosts && (
                    <Typography variant="body2" color="text.secondary">
                      No blog posts yet. Create your first one!
                    </Typography>
                  )}
                </List>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, post: null })}>
        <DialogTitle>Delete Blog Post?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{deleteDialog.post?.title}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, post: null })}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </MainCard>
  );
}
