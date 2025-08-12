<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import draggable from 'vuedraggable';

const { getProjects, getProjectIssues, updateIssueLabels, getProjectBoardLists } = useGitLabApi();
const router = useRouter();

const projects = ref([]);
const issues = ref([]);
const isLoading = ref(true);
const selectedProjects = ref([]);
const allLabels = ref([]);
const selectedLabels = ref([]);

const boardColumns = ref([]);
const boardData = ref({});

const defaultProjectColors = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#34d399',
  '#2dd4bf', '#22d3ee', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa',
  '#c084fc', '#e879f9', '#f472b6', '#fb7185'
];
const projectColors = ref([]);
const projectColorMap = ref({});

const assignProjectColors = () => {
  const newColorMap = {};
  projects.value.forEach((project, index) => {
    if (projectColors.value.length > 0) {
      newColorMap[project.id] = projectColors.value[index % projectColors.value.length];
    }
  });
  projectColorMap.value = newColorMap;
};

const getProjectColor = (projectId) => {
  return projectColorMap.value[projectId] || '#cccccc'; // A default fallback color
};

const updateBoardData = () => {
  const newBoardData = {};
  boardColumns.value.forEach(column => {
    newBoardData[column.label.name] = [];
  });

  const filteredIssues = issues.value.filter(issue => {
    const projectMatch = selectedProjects.value.length === 0 || selectedProjects.value.includes(issue.project_id);
    if (!projectMatch) return false;

    if (selectedLabels.value.length === 0) return true;

    return issue.labels.some(label => selectedLabels.value.includes(label.name));
  });

  const columnNames = boardColumns.value.map(c => c.label.name);

  filteredIssues.forEach(issue => {
    let placed = false;
    if (issue.labels) {
      for (const label of issue.labels) {
        if (columnNames.includes(label.name)) {
          newBoardData[label.name].push(issue);
          placed = true;
          break;
        }
      }
    }
    if (!placed && boardColumns.value.length > 0) {
      const firstColumnName = boardColumns.value[0].label.name;
      if(newBoardData[firstColumnName]) {
        newBoardData[firstColumnName].push(issue);
      }
    }
  });

  boardData.value = newBoardData;
};

const refreshInterval = ref(300000);
let refreshTimer = null;

const fetchData = async (isManualRefresh = false) => {
  if (!isManualRefresh) {
    isLoading.value = true;
  }
  try {
    const fetchedProjects = await getProjects();
    projects.value = fetchedProjects;
    assignProjectColors();

    if (fetchedProjects.length > 0 && boardColumns.value.length === 0) {
      const lists = await getProjectBoardLists(fetchedProjects[0].id);
      boardColumns.value = lists.sort((a, b) => a.position - b.position);
    }

    const issuePromises = fetchedProjects.map(async (project) => {
      const projectIssues = await getProjectIssues(project.id);
      return projectIssues.map(issue => ({
        ...issue,
        project_name: project.name,
      }));
    });

    const results = await Promise.all(issuePromises);
    const allIssues = results.flat();
    issues.value = allIssues;

    const uniqueLabels = {};
    allIssues.forEach(issue => {
      if (issue.labels) {
        issue.labels.forEach(label => {
          if (!uniqueLabels[label.name]) {
            uniqueLabels[label.name] = label;
          }
        });
      }
    });
    allLabels.value = Object.values(uniqueLabels).sort((a, b) => a.name.localeCompare(b.name));

    updateBoardData();
  } catch (error) {
    console.error('Failed to fetch data from GitLab:', error);
  } finally {
    if (!isManualRefresh) {
      isLoading.value = false;
    }
  }
};

const setupAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  if (refreshInterval.value > 0) {
    refreshTimer = setInterval(() => fetchData(true), refreshInterval.value);
  }
};

const manualRefresh = () => {
  fetchData(true);
  setupAutoRefresh();
};

onMounted(() => {
  const savedInterval = localStorage.getItem('refresh-interval');
  if (savedInterval) {
    refreshInterval.value = parseInt(savedInterval, 10);
  }

  const savedColors = localStorage.getItem('project-colors');
  if (savedColors) {
    projectColors.value = JSON.parse(savedColors);
  } else {
    projectColors.value = [...defaultProjectColors];
  }

  if (!localStorage.getItem('gitlab-url') || !localStorage.getItem('gitlab-token')) {
    router.push('/config');
    return;
  }

  fetchData();
  setupAutoRefresh();
});

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});

watch([selectedProjects, selectedLabels], updateBoardData, { deep: true });

const toggleProjectSelection = (projectId) => {
  const index = selectedProjects.value.indexOf(projectId);
  if (index > -1) {
    selectedProjects.value.splice(index, 1);
  } else {
    selectedProjects.value.push(projectId);
  }
};

const isProjectSelected = (projectId) => {
  return selectedProjects.value.includes(projectId);
};

const clearProjectFilter = () => {
  selectedProjects.value = [];
};

const toggleLabelSelection = (labelName) => {
  const index = selectedLabels.value.indexOf(labelName);
  if (index > -1) {
    selectedLabels.value.splice(index, 1);
  } else {
    selectedLabels.value.push(labelName);
  }
};

const isLabelSelected = (labelName) => {
  return selectedLabels.value.includes(labelName);
};

const clearLabelFilter = () => {
  selectedLabels.value = [];
};

const getLabelButtonStyle = (label) => {
  const selected = isLabelSelected(label.name);
  if (selected) {
    return {
      backgroundColor: label.color,
      color: getTextColor(label.color),
      borderColor: label.color,
    };
  } else {
    return {
      backgroundColor: 'transparent',
      color: label.color,
      borderColor: label.color,
    };
  }
};

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
  const newLabel = newColumnName;

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

  if (issue.labels.some(l => l.name === newLabel)) {
    return;
  }

  const columnLabels = boardColumns.value.map(c => c.label.name);
  const otherLabels = issue.labels.map(l => l.name).filter(label => !columnLabels.includes(label));
  const newLabels = [...otherLabels, newLabel];

  try {
    await updateIssueLabels(issue.project_id, issue.iid, newLabels);
    const oldColumnLabels = columnLabels;
    issue.labels = issue.labels.filter(l => !oldColumnLabels.includes(l.name));
    const newLabelColor = boardColumns.value.find(c => c.label.name === newLabel)?.label.color || '#000000';
    issue.labels.push({ name: newLabel, color: newLabelColor });
  } catch (error) {
    console.error('Failed to update issue labels on GitLab:', error);
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
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold text-gray-800">Filters</h2>
            <button @click="manualRefresh" class="p-2 rounded-full hover:bg-gray-200 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h5M20 20v-5h-5M4 4l5 5M20 20l-5-5" />
                </svg>
            </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div class="flex justify-between items-center mb-3">
              <h3 class="font-semibold text-gray-800">Filter by Project</h3>
              <button @click="clearProjectFilter" v-if="selectedProjects.length > 0" class="text-sm text-blue-600 hover:underline">Clear</button>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="project in projects"
                :key="project.id"
                @click="toggleProjectSelection(project.id)"
                :class="['px-3 py-1 rounded-full text-sm font-medium border', isProjectSelected(project.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-100']"
              >
                {{ project.name }}
              </button>
            </div>
          </div>
          <div>
            <div class="flex justify-between items-center mb-3">
              <h3 class="font-semibold text-gray-800">Filter by Label</h3>
              <button @click="clearLabelFilter" v-if="selectedLabels.length > 0" class="text-sm text-blue-600 hover:underline">Clear</button>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="label in allLabels"
                :key="label.id"
                @click="toggleLabelSelection(label.name)"
                class="px-3 py-1 rounded-full text-sm font-medium border-2 transition-colors"
                :style="getLabelButtonStyle(label)"
              >
                {{ label.name }}
              </button>
            </div>
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
                    <span
                      :style="{ backgroundColor: getProjectColor(issue.project_id), color: getTextColor(getProjectColor(issue.project_id)) }"
                      class="px-2 py-1 text-xs font-semibold rounded-full"
                    >
                      {{ issue.project_name }}
                    </span>
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
