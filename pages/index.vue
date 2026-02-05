<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import draggable from 'vuedraggable';

const { getProjects, getProjectIssues, updateIssueLabels, getProjectBoardLists } = useGitLabApi();

const projects = ref([]);
const issues = ref([]);
const isLoading = ref(true);
const selectedProjects = ref([]);
const allLabels = ref([]);
const selectedLabels = ref([]);

const boardColumns = ref([]);
const boardData = ref({});
const hiddenColumns = ref([]);

const defaultProjectColors = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#34d399',
  '#2dd4bf', '#22d3ee', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa',
  '#c084fc', '#e879f9', '#f472b6', '#fb7185'
];
const projectColors = ref([]);
const projectColorMap = ref({});

// --- Configuration State ---
const gitlabUrl = ref('');
const gitlabToken = ref('');
const refreshIntervalMinutes = ref(5);
const issueTitleFontSize = ref(14); // Default font size

// --- Configuration Functions ---
const saveConfig = () => {
  if (gitlabUrl.value && gitlabToken.value) {
    localStorage.setItem('gitlab-url', gitlabUrl.value);
    localStorage.setItem('gitlab-token', gitlabToken.value);
    localStorage.setItem('project-colors', JSON.stringify(projectColors.value));
    localStorage.setItem('refresh-interval', refreshIntervalMinutes.value * 60000);
    localStorage.setItem('issue-title-font-size', issueTitleFontSize.value);

    // Update the live values in the app
    refreshInterval.value = refreshIntervalMinutes.value * 60000;

    alert('Configuration saved!');
    showConfigModal.value = false;
    fetchData(); // Re-fetch data with new config
  } else {
    alert('Please fill in all required fields.');
  }
};

const addColor = () => {
  projectColors.value.push('#000000');
};

const removeColor = (index) => {
  projectColors.value.splice(index, 1);
};

const resetColors = () => {
  projectColors.value = [...defaultProjectColors];
  localStorage.setItem('project-colors', JSON.stringify(projectColors.value));
};


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

const visibleColumns = computed(() => {
  return boardColumns.value.filter(column => !hiddenColumns.value.includes(column.label.name));
});

const toggleColumnVisibility = (columnName) => {
  const index = hiddenColumns.value.indexOf(columnName);
  if (index > -1) {
    hiddenColumns.value.splice(index, 1);
  } else {
    hiddenColumns.value.push(columnName);
  }
  localStorage.setItem('hidden-columns', JSON.stringify(hiddenColumns.value));
  updateBoardData();
};

const isColumnVisible = (columnName) => {
  return !hiddenColumns.value.includes(columnName);
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
    if (issue.state === 'closed') {
      if (newBoardData['Closed']) {
        newBoardData['Closed'].push(issue);
      }
      return;
    }

    let placed = false;
    if (issue.labels) {
      for (const label of issue.labels) {
        if (columnNames.includes(label.name) && label.name !== 'Closed') {
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

    if (fetchedProjects.length > 0) {
      const listPromises = fetchedProjects.map(p => getProjectBoardLists(p.id));
      const results = await Promise.all(listPromises);
      const allLists = results.flat();

      if (allLists.length > 0) {
        const uniqueColumnsMap = new Map();
        allLists.forEach(list => {
          if (list.label && !uniqueColumnsMap.has(list.label.name)) {
            uniqueColumnsMap.set(list.label.name, list);
          }
        });

        const uniqueColumns = Array.from(uniqueColumnsMap.values());

        const customOrderStr = localStorage.getItem('column-order') || '';
        const customOrder = customOrderStr.split(',').map(s => s.trim()).filter(s => s);

        if (customOrder.length > 0) {
            uniqueColumns.sort((a, b) => {
                const nameA = a.label.name;
                const nameB = b.label.name;

                const indexA = customOrder.indexOf(nameA);
                const indexB = customOrder.indexOf(nameB);

                if (indexA !== -1 && indexB !== -1) {
                    return indexA - indexB;
                }
                if (indexA !== -1) {
                    return -1;
                }
                if (indexB !== -1) {
                    return 1;
                }
                return nameA.localeCompare(nameB);
            });
        } else {
            // Default to alphabetical sort if no custom order is set
            uniqueColumns.sort((a, b) => a.label.name.localeCompare(b.label.name));
        }

        boardColumns.value = uniqueColumns;
      } else {
        // Fallback to default columns if no lists are found
        console.warn("No board lists found for any project. Falling back to default columns.");
        boardColumns.value = [
          { label: { name: 'To Do', color: '#428BCA' }, position: 1 },
          { label: { name: 'Doing', color: '#F0AD4E' }, position: 2 },
          { label: { name: 'Done', color: '#5CB85C' }, position: 3 },
        ];
      }
      // Always add a 'Closed' column if it doesn't exist
      if (!boardColumns.value.some(c => c.label.name === 'Closed')) {
        boardColumns.value.push({ label: { name: 'Closed', color: '#808080' } });
      }
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
  gitlabUrl.value = localStorage.getItem('gitlab-url') || '';
  gitlabToken.value = localStorage.getItem('gitlab-token') || '';
  const savedColors = localStorage.getItem('project-colors');
  if (savedColors) {
    projectColors.value = JSON.parse(savedColors);
  } else {
    projectColors.value = [...defaultProjectColors];
  }
  const savedInterval = localStorage.getItem('refresh-interval');
  if (savedInterval) {
    refreshIntervalMinutes.value = parseInt(savedInterval, 10) / 60000;
    refreshInterval.value = parseInt(savedInterval, 10);
  }
  const savedFontSize = localStorage.getItem('issue-title-font-size');
  if (savedFontSize) {
    issueTitleFontSize.value = parseInt(savedFontSize, 10);
  }
  const savedHiddenColumns = localStorage.getItem('hidden-columns');
  if (savedHiddenColumns) {
    hiddenColumns.value = JSON.parse(savedHiddenColumns);
  }

  if (!gitlabUrl.value || !gitlabToken.value) {
    showConfigModal.value = true;
  } else {
    fetchData();
    setupAutoRefresh();
  }

  window.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  window.removeEventListener('click', handleClickOutside);
});

watch([selectedProjects, selectedLabels], updateBoardData, { deep: true });

const showProjectFilter = ref(false);
const showLabelFilter = ref(false);
const showColumnFilter = ref(false);
const showConfigModal = ref(false);
const projectFilterRef = ref(null);
const labelFilterRef = ref(null);
const columnFilterRef = ref(null);

const toggleProjectFilter = () => {
  showProjectFilter.value = !showProjectFilter.value;
  if (showProjectFilter.value) {
    showLabelFilter.value = false;
    showColumnFilter.value = false;
  }
};

const openConfigModal = () => {
  showConfigModal.value = true;
};

const toggleLabelFilter = () => {
  showLabelFilter.value = !showLabelFilter.value;
  if (showLabelFilter.value) {
    showProjectFilter.value = false;
    showColumnFilter.value = false;
  }
};

const toggleColumnFilter = () => {
  showColumnFilter.value = !showColumnFilter.value;
  if (showColumnFilter.value) {
    showProjectFilter.value = false;
    showLabelFilter.value = false;
  }
};

const handleClickOutside = (event) => {
  if (projectFilterRef.value && !projectFilterRef.value.contains(event.target)) {
    showProjectFilter.value = false;
  }
  if (labelFilterRef.value && !labelFilterRef.value.contains(event.target)) {
    showLabelFilter.value = false;
  }
  if (columnFilterRef.value && !columnFilterRef.value.contains(event.target)) {
    showColumnFilter.value = false;
  }
};

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

const onColumnDragEnd = () => {
  const visibleColumnNames = visibleColumns.value.map(column => column.label.name);
  const hiddenColumnNames = hiddenColumns.value;

  const allColumnNames = [...visibleColumnNames, ...hiddenColumnNames];
  localStorage.setItem('column-order', allColumnNames.join(','));

  boardColumns.value.sort((a, b) => {
    const indexA = allColumnNames.indexOf(a.label.name);
    const indexB = allColumnNames.indexOf(b.label.name);
    return indexA - indexB;
  });
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
    let errorMessage = `Failed to move issue to column "${newLabel}".`;
    if (error.response && error.response.status === 400) {
        errorMessage += `\n\nError: The label "${newLabel}" might not exist in the project "${issue.project_name}". Please ensure it is created in GitLab.`;
    } else if (error.response && error.response._data && error.response._data.message) {
        errorMessage += `\n\nGitLab API Error: ${error.response._data.message.error || error.response._data.message}`;
    }
    alert(errorMessage);
    updateBoardData();
  }
};
</script>

<template>
  <div class="h-screen flex flex-col">
    <div v-if="isLoading" class="loading-container">
      <svg width="120" height="120" viewBox="0 0 1000 963.197" class="gitlab-logo-animation">
        <g transform="matrix(5.2068817,0,0,5.2068817,-489.30756,-507.76085)">
          <path fill="#e24329" d="m 282.83,170.73 -0.27,-0.69 -26.14,-68.22 a 6.81,6.81 0 0 0 -2.69,-3.24 7,7 0 0 0 -8,0.43 7,7 0 0 0 -2.32,3.52 l -17.65,54 h -71.47 l -17.65,-54 a 6.86,6.86 0 0 0 -2.32,-3.53 7,7 0 0 0 -8,-0.43 6.87,6.87 0 0 0 -2.69,3.24 L 97.44,170 l -0.26,0.69 a 48.54,48.54 0 0 0 16.1,56.1 l 0.09,0.07 0.24,0.17 39.82,29.82 19.7,14.91 12,9.06 a 8.07,8.07 0 0 0 9.76,0 l 12,-9.06 19.7,-14.91 40.06,-30 0.1,-0.08 a 48.56,48.56 0 0 0 16.08,-56.04 z" />
          <path fill="#fc6d26" d="m 282.83,170.73 -0.27,-0.69 a 88.3,88.3 0 0 0 -35.15,15.8 L 190,229.25 c 19.55,14.79 36.57,27.64 36.57,27.64 l 40.06,-30 0.1,-0.08 a 48.56,48.56 0 0 0 16.1,-56.08 z" />
          <path fill="#fca326" d="m 153.43,256.89 19.7,14.91 12,9.06 a 8.07,8.07 0 0 0 9.76,0 l 12,-9.06 19.7,-14.91 c 0,0 -17.04,-12.89 -36.59,-27.64 -19.55,14.75 -36.57,27.64 -36.57,27.64 z" />
          <path fill="#fc6d26" d="M 132.58,185.84 A 88.19,88.19 0 0 0 97.44,170 l -0.26,0.69 a 48.54,48.54 0 0 0 16.1,56.1 l 0.09,0.07 0.24,0.17 39.82,29.82 c 0,0 17,-12.85 36.57,-27.64 z" />
        </g>
      </svg>
      <div class="loading-subtext">Loading MegaBoard...</div>
    </div>
    <div v-else class="flex flex-col flex-grow min-h-0 bg-gray-50">
      <!-- Enhanced Toolbar Section -->
      <div class="bg-gradient-to-r from-white to-gray-50 border-b border-gray-200 shadow-sm">
        <div class="px-6 py-4">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div class="flex items-center gap-3">
              <!-- Project Filter Dropdown -->
              <div class="relative" ref="projectFilterRef">
                <button @click="toggleProjectFilter" class="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                  Projects
                  <span v-if="selectedProjects.length > 0" class="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500 text-white">{{ selectedProjects.length }}</span>
                </button>
                <div v-if="showProjectFilter" class="absolute z-20 mt-2 w-80 origin-top-left bg-white rounded-lg shadow-xl ring-1 ring-black ring-opacity-5 p-5 animate-fadeIn">
                  <div class="flex justify-between items-center mb-4">
                    <h3 class="text-base font-bold text-gray-900">Filter by Project</h3>
                    <button @click="clearProjectFilter" v-if="selectedProjects.length > 0" class="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors">Clear All</button>
                  </div>
                  <div class="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                    <button
                      v-for="project in projects"
                      :key="project.id"
                      @click="toggleProjectSelection(project.id)"
                      :class="['px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all', isProjectSelected(project.id) ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400']"
                    >
                      {{ project.name }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Label Filter Dropdown -->
              <div class="relative" ref="labelFilterRef">
                <button @click="toggleLabelFilter" class="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" />
                  </svg>
                  Labels
                  <span v-if="selectedLabels.length > 0" class="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500 text-white">{{ selectedLabels.length }}</span>
                </button>
                <div v-if="showLabelFilter" class="absolute z-20 mt-2 w-96 origin-top-left bg-white rounded-lg shadow-xl ring-1 ring-black ring-opacity-5 p-5 animate-fadeIn">
                  <div class="flex justify-between items-center mb-4">
                    <h3 class="text-base font-bold text-gray-900">Filter by Label</h3>
                    <button @click="clearLabelFilter" v-if="selectedLabels.length > 0" class="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors">Clear All</button>
                  </div>
                  <div class="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                    <button
                      v-for="label in allLabels"
                      :key="label.id"
                      @click="toggleLabelSelection(label.name)"
                      class="px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all hover:shadow-md"
                      :style="getLabelButtonStyle(label)"
                    >
                      {{ label.name }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Column Visibility Filter -->
              <div class="relative" ref="columnFilterRef">
                <button @click="toggleColumnFilter" class="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v13.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                  Columns
                  <span v-if="hiddenColumns.length > 0" class="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-gray-500 text-white">{{ visibleColumns.length }}/{{ boardColumns.length }}</span>
                </button>
                <div v-if="showColumnFilter" class="absolute z-20 mt-2 w-72 origin-top-left bg-white rounded-lg shadow-xl ring-1 ring-black ring-opacity-5 p-5 animate-fadeIn">
                  <div class="mb-4">
                    <h3 class="text-base font-bold text-gray-900 mb-2">Toggle Columns</h3>
                    <p class="text-xs text-gray-600">Select which columns to display on the board</p>
                  </div>
                  <div class="space-y-2 max-h-64 overflow-y-auto">
                    <label
                      v-for="column in boardColumns"
                      :key="column.label.name"
                      class="flex items-center gap-3 p-2 rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        :checked="isColumnVisible(column.label.name)"
                        @change="toggleColumnVisibility(column.label.name)"
                        class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                      />
                      <div class="flex items-center gap-2 flex-1">
                        <span
                          class="w-3 h-3 rounded-full"
                          :style="{ backgroundColor: column.label.color }"
                        ></span>
                        <span class="text-sm font-medium text-gray-700">{{ column.label.name }}</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <!-- Refresh Button -->
              <button @click="manualRefresh" class="inline-flex items-center gap-2 p-2.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all shadow-sm" title="Refresh data">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.667 0l3.181-3.183m-4.991-11.666a8.25 8.25 0 00-11.667 0l-3.181 3.183" />
                </svg>
              </button>

              <!-- Settings Button -->
              <button @click="openConfigModal" class="inline-flex items-center gap-2 p-2.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all shadow-sm" title="Settings">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-1.163l.043-.02a8.916 8.916 0 011.913-.38c.543-.053 1.097-.053 1.64 0a8.94 8.94 0 011.913.38l.043.02c.55.223 1.02.62 1.11 1.163.09.542.56.94 1.11 1.163l.043.02c.465.19.865.518 1.156.943.291.425.466.935.5 1.468.033.542.425 1.002.964 1.183.54.181.954.612 1.102 1.148.147.536.087 1.115-.165 1.61-.253.495-.677.862-1.183 1.024-.54.18-.93.64-.964 1.182a3.75 3.75 0 01-.5 1.468 3.75 3.75 0 01-1.156.943l-.043.02c-.55.223-1.02.62-1.11 1.163-.09.542-.56.94-1.11 1.163l-.043.02a8.916 8.916 0 01-1.913.38c-.543.053-1.097.053-1.64 0a8.94 8.94 0 01-1.913-.38l-.043-.02c-.55-.223-1.02-.62-1.11-1.163-.09-.542-.56-.94-1.11-1.163l-.043-.02a3.75 3.75 0 01-1.156-.943 3.75 3.75 0 01-.5-1.468c-.033-.542-.425-1.002-.964-1.183a2.25 2.25 0 01-1.102-1.148 2.25 2.25 0 01.165-1.61c.253-.495.677-.862 1.183-1.024.54-.18.93-.64.964-1.182.034-.533.209-1.043.5-1.468.291-.425.691-.753 1.156-.943l.043-.02c.55-.223 1.02-.62 1.11-1.163zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Board Section -->
      <div class="flex gap-6 overflow-x-auto pb-6 px-6 pt-6">
        <draggable
          :list="visibleColumns"
          group="columns"
          item-key="label.name"
          class="flex gap-6"
          @end="onColumnDragEnd"
        >
          <template #item="{ element: column }">
            <div
              :data-column-name="column.label.name"
              class="board-column bg-white rounded-xl w-80 flex-shrink-0 flex flex-col shadow-md border border-gray-200 hover:shadow-lg transition-shadow"
            >
              <div class="p-4 border-b border-gray-200 flex-shrink-0 bg-gradient-to-r from-gray-50 to-white rounded-t-xl">
                <div class="flex items-center gap-2 cursor-move">
                  <span class="w-3 h-3 rounded-full flex-shrink-0" :style="{ backgroundColor: column.label.color }"></span>
                  <h2 class="font-bold text-base text-gray-800">{{ column.label.name }}</h2>
                  <span class="ml-auto px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold">{{ boardData[column.label.name] ? boardData[column.label.name].length : 0 }}</span>
                </div>
              </div>
              <draggable
                :list="boardData[column.label.name]"
                group="issues"
                item-key="id"
                class="p-4 space-y-3 overflow-y-auto flex-grow min-h-[200px]"
                @end="onDragEnd"
              >
                <template #item="{ element: issue }">
                  <div :data-issue-id="issue.id" class="bg-white p-4 rounded-lg shadow-sm border-2 border-gray-200 hover:border-blue-400 hover:shadow-md cursor-move transition-all">
                    <a :href="issue.web_url" target="_blank" rel="noopener noreferrer" class="font-semibold text-gray-900 hover:text-blue-600 hover:underline block mb-2" :style="{ fontSize: `${issueTitleFontSize}px` }">
                      {{ issue.title }}
                    </a>
                    <div class="flex flex-wrap gap-1.5 mb-3">
                      <span
                        v-for="label in issue.labels"
                        :key="label.id"
                        :style="{ backgroundColor: label.color, color: getTextColor(label.color) }"
                        class="px-2 py-1 text-xs font-semibold rounded-md"
                      >
                        {{ label.name }}
                      </span>
                    </div>
                    <div class="flex items-center justify-between text-xs">
                      <span class="text-gray-500 font-medium">#{{ issue.iid }}</span>
                      <div class="flex items-center gap-1.5">
                        <span v-if="issue.milestone" class="px-2 py-1 bg-gray-100 text-gray-700 rounded-md font-semibold">
                          {{ issue.milestone.title }}
                        </span>
                        <span
                          :style="{ backgroundColor: getProjectColor(issue.project_id), color: getTextColor(getProjectColor(issue.project_id)) }"
                          class="px-2 py-1 rounded-md font-semibold"
                        >
                          {{ issue.project_name }}
                        </span>
                        <img
                          v-if="issue.assignees && issue.assignees.length > 0"
                          :src="issue.assignees[0].avatar_url"
                          alt="Assignee Avatar"
                          class="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                        />
                      </div>
                    </div>
                  </div>
                </template>
              </draggable>
            </div>
          </template>
        </draggable>
      </div>
    </div>

    <!-- Configuration Modal -->
    <div v-if="showConfigModal" class="fixed inset-0 bg-black bg-opacity-60 z-40 flex justify-center items-center p-4">
      <div class="bg-white p-8 rounded-lg shadow-2xl w-full max-w-2xl relative max-h-[90vh] overflow-y-auto" @click.stop>
        <button @click="showConfigModal = false" class="absolute top-4 right-4 text-2xl text-gray-500 hover:text-gray-800">&times;</button>
        <h1 class="text-2xl font-bold mb-6 text-center">Configuration</h1>
        <form @submit.prevent="saveConfig">
          <div class="mb-4">
            <label for="gitlabUrl" class="block text-gray-700 font-bold mb-2">GitLab URL</label>
            <input id="gitlabUrl" v-model="gitlabUrl" type="text" placeholder="https://gitlab.com" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-blue-300"/>
          </div>
          <div class="mb-6">
            <label for="gitlabToken" class="block text-gray-700 font-bold mb-2">Personal Access Token</label>
            <input id="gitlabToken" v-model="gitlabToken" type="password" placeholder="your-token" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-blue-300"/>
          </div>
          <div class="mb-6">
              <label for="refreshInterval" class="block text-gray-700 font-bold mb-2">Auto-refresh Interval (minutes)</label>
              <input id="refreshInterval" v-model.number="refreshIntervalMinutes" type="number" min="0" placeholder="5" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-blue-300"/>
              <p class="text-xs text-gray-600 mt-1">Set to 0 to disable auto-refresh.</p>
          </div>
          <div class="mb-6">
            <label for="fontSize" class="block text-gray-700 font-bold mb-2">Issue Title Font Size <span class="font-normal text-gray-600">({{ issueTitleFontSize }}px)</span></label>
            <input id="fontSize" v-model.number="issueTitleFontSize" type="range" min="12" max="20" step="1" class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"/>
          </div>
          <div class="mb-6">
            <h2 class="text-xl font-bold mb-4">Project Label Colors</h2>
            <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
              <div v-for="(color, index) in projectColors" :key="index" class="relative group">
                <input type="color" v-model="projectColors[index]" class="w-12 h-12 p-1 border rounded-full cursor-pointer"/>
                <button @click.prevent="removeColor(index)" class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
              </div>
            </div>
            <div class="mt-4 flex gap-2">
              <button @click.prevent="addColor" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Add Color</button>
              <button @click.prevent="resetColors" class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg">Reset to Default</button>
            </div>
          </div>
          <button type="submit" class="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline">Save Configuration</button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loading-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #fff;
  position: relative;
  overflow: hidden;
}

.gitlab-logo-animation {
  animation: gitlab-pulse 2s infinite ease-in-out;
}

@keyframes gitlab-pulse {
  0% {
    transform: scale(0.95);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(0.95);
  }
}

.loading-subtext {
  margin-top: 20px;
  color: #4b5563;
  font-size: 1.125rem;
  font-weight: 500;
}

.animate-fadeIn {
  animation: fadeIn 0.2s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.board-column {
  min-width: 320px;
}

.board-column:hover .cursor-move {
  opacity: 0.8;
}
</style>
