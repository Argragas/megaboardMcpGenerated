<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import draggable from 'vuedraggable';

const { getProjects, getProjectIssues, updateIssueLabels } = useGitLabApi();
const router = useRouter();

const projects = ref([]);
const issues = ref([]);
const isLoading = ref(true);
const selectedProjects = ref([]);

// Define the columns for the board.
const boardColumns = {
  'To Do': 'To Do',
  'Doing': 'Doing',
  'Done': 'Done',
};
const boardData = ref({});

const updateBoardData = () => {
  const newBoardData = {};
  Object.keys(boardColumns).forEach(title => {
    newBoardData[title] = [];
  });

  const filteredIssues = issues.value.filter(issue => {
    return selectedProjects.value.length === 0 || selectedProjects.value.includes(issue.project_id);
  });

  filteredIssues.forEach(issue => {
    let placed = false;
    for (const label of issue.labels) {
      const columnName = Object.keys(boardColumns).find(key => boardColumns[key] === label.name);
      if (columnName) {
        newBoardData[columnName].push(issue);
        placed = true;
        break;
      }
    }
    if (!placed) {
      if (newBoardData['To Do']) {
        newBoardData['To Do'].push(issue);
      }
    }
  });

  boardData.value = newBoardData;
};

onMounted(async () => {
  if (!localStorage.getItem('gitlab-url') || !localStorage.getItem('gitlab-token')) {
    router.push('/config');
    return;
  }

  try {
    isLoading.value = true;
    const fetchedProjects = await getProjects();
    projects.value = fetchedProjects;

    let allIssues = [];
    // Fetch issues in parallel for faster loading
    const issuePromises = fetchedProjects.map(async (project) => {
      const projectIssues = await getProjectIssues(project.id);
      return projectIssues.map(issue => ({
        ...issue,
        project_name: project.name,
      }));
    });

    const results = await Promise.all(issuePromises);
    allIssues = results.flat();

    issues.value = allIssues;
    updateBoardData(); // Initial population of the board
  } catch (error) {
    console.error('Failed to fetch data from GitLab:', error);
  } finally {
    isLoading.value = false;
  }
});

watch([selectedProjects], updateBoardData, { deep: true });

const getTextColor = (backgroundColor) => {
  if (!backgroundColor) return '#000000';
  const color = backgroundColor.charAt(0) === '#' ? backgroundColor.substring(1, 7) : backgroundColor;
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  const uicolors = [r / 255, g / 255, b / 255];
  const c = uicolors.map((col) => {
    if (col <= 0.03928) {
      return col / 12.92;
    }
    return Math.pow((col + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return (L > 0.179) ? '#000000' : '#FFFFFF';
};

const onDragEnd = async (event) => {
  const { to, item } = event;
  const newColumnElement = to.closest('.board-column');
  const newColumnName = newColumnElement.dataset.columnName;
  const newLabel = boardColumns[newColumnName];

  if (!newLabel) {
    console.error('Could not determine new label for the column.');
    return;
  }

  const issueId = item.dataset.issueId;
  const issue = issues.value.find(i => i.id == issueId);

  if (!issue) {
    console.error('Could not find the issue that was moved.');
    return;
  }

  // Prevent API call if the label is already present
  if (issue.labels.some(l => l.name === newLabel)) {
    return;
  }

  const otherLabels = issue.labels.map(l => l.name).filter(label => !Object.values(boardColumns).includes(label));
  const newLabels = [...otherLabels, newLabel];

  try {
    await updateIssueLabels(issue.project_id, issue.iid, newLabels);
    // This is a bit of a hack to avoid re-fetching the issue.
    // We are assuming the update was successful and we add the new label.
    // A better approach would be to fetch the issue again.
    issue.labels.push({ name: newLabel, color: '#000000' }); // We don't have the color here, so we default to black.
  } catch (error) {
    console.error('Failed to update issue labels on GitLab:', error);
    // Revert UI change on failure
    updateBoardData();
  }
};
</script>

<template>
  <div>
    <div v-if="isLoading" class="flex justify-center items-center h-64">
      <p class="text-lg text-gray-600">Loading your MegaBoard...</p>
    </div>
    <div v-else>
      <!-- Filter Section -->
      <div class="p-4 mb-4 bg-white rounded-lg shadow-sm">
        <h3 class="font-semibold text-gray-800 mb-3">Filter by Project</h3>
        <div class="flex flex-wrap gap-x-6 gap-y-2">
          <div v-for="project in projects" :key="project.id" class="flex items-center">
            <input
              :id="'project-' + project.id"
              :value="project.id"
              v-model="selectedProjects"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label :for="'project-' + project.id" class="ml-2 text-sm text-gray-700">{{ project.name }}</label>
          </div>
        </div>
      </div>

      <!-- Board Section -->
      <div class="flex gap-6 overflow-x-auto pb-4">
        <div
          v-for="(issuesInColumn, columnName) in boardData"
          :key="columnName"
          :data-column-name="columnName"
          class="board-column bg-gray-200 rounded-lg w-80 flex-shrink-0">
          <div class="p-4 border-b border-gray-300">
            <h2 class="font-semibold text-lg text-gray-800">{{ columnName }} <span class="text-gray-500 font-normal">({{ issuesInColumn.length }})</span></h2>
          </div>
          <draggable
            :list="issuesInColumn"
            group="issues"
            item-key="id"
            class="p-4 space-y-4 min-h-[300px]"
            @end="onDragEnd"
          >
            <template #item="{ element: issue }">
              <div :data-issue-id="issue.id" class="bg-white p-4 rounded-md shadow-sm border border-gray-200 hover:border-blue-500 cursor-move">
                <p class="font-medium text-gray-900">{{ issue.title }}</p>
                <div class="flex flex-wrap gap-2 mt-2">
                  <span
                    v-for="label in issue.labels"
                    :key="label.id"
                    :style="{ backgroundColor: label.color, color: getTextColor(label.color) }"
                    class="px-2 py-1 text-xs font-semibold rounded-full"
                  >
                    {{ label.name }}
                  </span>
                </div>
                <div class="flex items-center justify-between mt-3 text-sm">
                  <span class="text-gray-500">#{{ issue.iid }}</span>
                  <div class="flex items-center">
                    <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded-full">{{ issue.project_name }}</span>
                    <img
                      v-if="issue.assignees && issue.assignees.length > 0"
                      :src="issue.assignees[0].avatar_url"
                      alt="Assignee Avatar"
                      class="w-6 h-6 rounded-full ml-2"
                    />
                  </div>
                </div>
              </div>
            </template>
          </draggable>
        </div>
      </div>
    </div>
  </div>
</template>
