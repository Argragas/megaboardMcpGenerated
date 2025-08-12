import { ofetch } from 'ofetch';

export const useGitLabApi = () => {
  const getHeaders = () => {
    if (!process.client) {
      return {};
    }
    const token = localStorage.getItem('gitlab-token');
    if (!token) {
      console.error('GitLab token not found in localStorage.');
      // In a real app, you might want to redirect to the config page
      return {};
    }
    return {
      'PRIVATE-TOKEN': token,
    };
  };

  const getBaseUrl = () => {
    if (!process.client) {
      return '';
    }
    const url = localStorage.getItem('gitlab-url');
    if (!url) {
      console.error('GitLab URL not found in localStorage.');
      return '';
    }
    return `${url}/api/v4`;
  };

  const apiFetch = ofetch.create({
    baseURL: getBaseUrl(),
    headers: getHeaders(),
    async onResponseError({ response }) {
      // Log detailed error information
      console.error('GitLab API request failed:', response.status, response.statusText, response._data);
    }
  });

  const getProjects = () => {
    // We need to re-evaluate the config on each call in case it changed.
    const baseURL = getBaseUrl();
    const headers = getHeaders();
    if (!baseURL || !headers['PRIVATE-TOKEN']) return Promise.resolve([]);

    return ofetch('/projects?membership=true&per_page=100', { baseURL, headers });
  };

  const getProjectIssues = (projectId) => {
    const baseURL = getBaseUrl();
    const headers = getHeaders();
    if (!baseURL || !headers['PRIVATE-TOKEN']) return Promise.resolve([]);

    return ofetch(`/projects/${projectId}/issues?per_page=100&with_labels_details=true`, { baseURL, headers });
  };

  const updateIssueLabels = (projectId, issueIid, labels) => {
    const baseURL = getBaseUrl();
    const headers = getHeaders();
    if (!baseURL || !headers['PRIVATE-TOKEN']) return Promise.reject('Missing config');

    return ofetch(`/projects/${projectId}/issues/${issueIid}`, {
      baseURL,
      headers,
      method: 'PUT',
      body: {
        labels: labels.join(','),
      },
    });
  };

  const getProjectBoardLists = async (projectId) => {
    const baseURL = getBaseUrl();
    const headers = getHeaders();
    if (!baseURL || !headers['PRIVATE-TOKEN']) return Promise.resolve([]);

    try {
      const boards = await ofetch(`/projects/${projectId}/boards`, { baseURL, headers });
      if (boards && boards.length > 0) {
        const boardId = boards[0].id;
        return await ofetch(`/projects/${projectId}/boards/${boardId}/lists`, { baseURL, headers });
      }
    } catch (error) {
      console.error(`Failed to get board lists for project ${projectId}:`, error);
    }
    return [];
  };

  return {
    getProjects,
    getProjectIssues,
    updateIssueLabels,
    getProjectBoardLists,
  };
};
