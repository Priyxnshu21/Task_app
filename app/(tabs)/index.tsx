import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Keyboard,
  Platform,
  useColorScheme,
  Modal,
  AccessibilityInfo,
} from 'react-native';
import Animated, { Layout as ReanimatedLayout, useAnimatedStyle, withSpring, useSharedValue } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function AnimatedCheckBox({ completed, onPress }: { completed: boolean; onPress: () => void }) {
  const scale = useSharedValue(completed ? 1.1 : 1);
  useEffect(() => {
    scale.value = withSpring(completed ? 1.1 : 1, { damping: 5 });
  }, [completed]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        onPress={onPress}
        accessibilityLabel={completed ? 'Mark as incomplete' : 'Mark as complete'}
        accessibilityRole="button"
        style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
      >
        <Ionicons
          name={completed ? 'checkbox' : 'square-outline'}
          size={26}
          color={completed ? '#222' : '#333'}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function App() {
  const [task, setTask] = useState('');
  const [tasks, setTasks] = useState<
    { id: string; text: string; completed: boolean; priority: 'high' | 'medium' | 'low'; notificationId?: string }[]
  >([]);
  const [editInfo, setEditInfo] = useState<{ id: string; text: string } | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editText, setEditText] = useState('');

  const inputRef = useRef<TextInput>(null);
  const colorScheme = useColorScheme();

  useEffect(() => {
    loadTasks();
    registerForPushNotificationsAsync();
  }, []);

  useEffect(() => {
    saveTasks();
  }, [tasks]);

  const registerForPushNotificationsAsync = async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('task-reminders', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }
  };

  const loadTasks = async () => {
    try {
      const savedTasks = await AsyncStorage.getItem('tasks');
      if (savedTasks) {
        setTasks(JSON.parse(savedTasks));
      }
    } catch (error) {
      console.error('Failed to load tasks.', error);
    }
  };

  const saveTasks = async () => {
    try {
      await AsyncStorage.setItem('tasks', JSON.stringify(tasks));
    } catch (error) {
      console.error('Failed to save tasks.', error);
    }
  };

  const scheduleNotification = async (taskText: string) => {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Task Reminder',
        body: `Time to complete: ${taskText}`,
      },
      trigger: { seconds: 10, channelId: 'task-reminders' }, // 10 seconds for testing
    });
    return id;
  };

  const cancelNotification = async (notificationId?: string) => {
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    }
  };

  const handleEditTask = (id: string, text: string) => {
    setEditInfo({ id, text });
    setEditText(text);
    setEditModalVisible(true);
  };

  // Announce actions for screen readers
  const announce = (message: string) => {
    AccessibilityInfo.announceForAccessibility?.(message);
  };

  const handleSaveEdit = () => {
    if (editInfo && editText.trim()) {
      setTasks(
        tasks.map((t) => (t.id === editInfo.id ? { ...t, text: editText } : t))
      );
      setEditInfo(null);
      setEditText('');
      setEditModalVisible(false);
      announce('Task updated');
    }
  };

  const handleCancelEdit = () => {
    setEditInfo(null);
    setEditText('');
    setEditModalVisible(false);
  };

  const handleAddTask = async () => {
    if (task.trim()) {
      // Only add a new task if not editing
      if (!editModalVisible) {
        const notificationId = await scheduleNotification(task);
        setTasks([
          ...tasks,
          {
            id: Date.now().toString(),
            text: task,
            completed: false,
            priority: 'medium',
            notificationId,
          },
        ]);
        announce('Task added');
        setTask('');
        Keyboard.dismiss();
      }
    }
  };

  const handleToggleComplete = (id: string) => {
    const taskToToggle = tasks.find((t) => t.id === id);
    if (taskToToggle?.completed) {
      // If task is being marked as incomplete, reschedule notification
      scheduleNotification(taskToToggle.text).then((newNotificationId) => {
        setTasks(
          tasks.map((t) =>
            t.id === id ? { ...t, completed: !t.completed, notificationId: newNotificationId } : t
          )
        );
        announce('Task marked incomplete');
      });
    } else {
      // If task is being marked as complete, cancel notification
      cancelNotification(taskToToggle?.notificationId);
      setTasks(
        tasks.map((t) =>
          t.id === id ? { ...t, completed: !t.completed, notificationId: undefined } : t
        )
      );
      announce('Task marked complete');
    }
  };

  const handleDeleteTask = (id: string) => {
    const taskToDelete = tasks.find((t) => t.id === id);
    cancelNotification(taskToDelete?.notificationId);
    setTasks(tasks.filter((t) => t.id !== id));
    announce('Task deleted');
  };

  const handlePriorityChange = (id: string, priority: 'high' | 'medium' | 'low') => {
    setTasks(
      tasks.map((t) => (t.id === id ? { ...t, priority } : t))
    );
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return '#ff4d4d';
      case 'medium':
        return '#ffa500';
      case 'low':
        return '#4caf50';
      default:
        return '#ccc';
    }
  };

  const chipStyles: { [key: string]: any } = {
    high: styles.chip_high,
    medium: styles.chip_medium,
    low: styles.chip_low,
  };

  const renderRightActions = (id: string) => (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={() => handleDeleteTask(id)}
      accessibilityLabel="Delete task"
      accessibilityRole="button"
    >
      <Ionicons name="trash" size={28} color="#fff" />
    </TouchableOpacity>
  );

  // Minimal renderTask for debug
  const renderTask = ({ item }: { item: { id: string; text: string; completed: boolean; priority: string } }) => (
    <Swipeable
      renderRightActions={() => renderRightActions(item.id)}
      overshootRight={false}
    >
      <View style={[
        styles.taskCard,
        colorScheme === 'dark' && styles.taskCardDark,
        { minHeight: 60 }
      ]}>
        {/* Complete/Done Toggle */}
        <TouchableOpacity
          onPress={() => handleToggleComplete(item.id)}
          accessibilityLabel={item.completed ? 'Mark as incomplete' : 'Mark as complete'}
          accessibilityRole="button"
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
        >
          <Ionicons
            name={item.completed ? 'checkbox' : 'square-outline'}
            size={26}
            color={item.completed ? '#222' : '#333'}
          />
        </TouchableOpacity>
        {/* Task Text */}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[
            styles.taskText,
            item.completed && styles.completedText,
            colorScheme === 'dark' && styles.taskTextDark
          ]}>
            {item.text}
          </Text>
          {/* Priority Chip */}
          <View style={styles.chipRow}>
            <View style={[styles.chip, chipStyles[item.priority]]}>
              <Text style={styles.chipText}>{item.priority.toUpperCase()}</Text>
            </View>
          </View>
        </View>
        {/* Edit Icon */}
        <TouchableOpacity
          onPress={() => handleEditTask(item.id, item.text)}
          style={{ marginHorizontal: 4, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
          accessibilityLabel="Edit task"
          accessibilityRole="button"
        >
          <Ionicons name="pencil" size={20} color="#4a90e2" />
        </TouchableOpacity>
      </View>
    </Swipeable>
  );

  return (
    <View style={[styles.container, colorScheme === 'dark' && styles.containerDark]}>
      <Text style={[styles.title, colorScheme === 'dark' && styles.titleDark]}>My Tasks</Text>
      <View style={styles.inputContainer}>
        <TextInput
          ref={inputRef}
          style={[styles.input, colorScheme === 'dark' && styles.inputDark]}
          placeholder="Add a new task..."
          placeholderTextColor={colorScheme === 'dark' ? '#aaa' : '#888'}
          value={task}
          onChangeText={setTask}
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAddTask} accessibilityLabel="Add task" accessibilityRole="button">
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>
      {tasks.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="playlist-add-check" size={64} color="#4a90e2" style={{ marginBottom: 12 }} />
          <Text style={styles.emptyText}>No tasks yet! Add your first task above.</Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          renderItem={renderTask}
          keyExtractor={item => item.id}
          style={styles.list}
        />
      )}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => inputRef.current?.focus()}
        accessibilityLabel="Focus input to add task"
        accessibilityRole="button"
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>
      {/* Edit Task Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent
        onRequestClose={handleCancelEdit}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, colorScheme === 'dark' && styles.modalContentDark]}>
            <Text style={[styles.modalTitle, colorScheme === 'dark' && styles.modalTitleDark]}>Edit Task</Text>
            <TextInput
              style={[styles.modalInput, colorScheme === 'dark' && styles.modalInputDark]}
              value={editText}
              onChangeText={setEditText}
              placeholder="Edit your task..."
              placeholderTextColor={colorScheme === 'dark' ? '#aaa' : '#888'}
              autoFocus
              accessibilityLabel="Edit task input"
            />
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }]}
                onPress={handleCancelEdit}
                accessibilityLabel="Cancel editing"
                accessibilityRole="button"
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton, { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }]}
                onPress={handleSaveEdit}
                accessibilityLabel="Save changes"
                accessibilityRole="button"
              >
                <Text style={[styles.modalButtonText, styles.modalSaveButtonText]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
    paddingTop: 50,
  },
  containerDark: {
    backgroundColor: '#181a20',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
    color: '#333',
    letterSpacing: 1,
  },
  titleDark: {
    color: '#fff',
  },
  inputContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 10,
    fontSize: 17,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  inputDark: {
    backgroundColor: '#23242a',
    color: '#fff',
    borderColor: '#333',
  },
  addButton: {
    backgroundColor: '#4a90e2',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4a90e2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  list: {
    flex: 1,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  taskCardDark: {
    backgroundColor: '#23242a',
    shadowColor: '#000',
  },
  taskText: {
    fontSize: 17,
    color: '#222',
    fontWeight: '500',
  },
  taskTextDark: {
    color: '#fff',
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#aaa',
    fontWeight: '400',
  },
  chipRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  chip: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 6,
    alignSelf: 'flex-start',
  },
  chipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  chip_high: {
    backgroundColor: '#ff4d4d',
  },
  chip_medium: {
    backgroundColor: '#ffa500',
  },
  chip_low: {
    backgroundColor: '#4caf50',
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 36,
    backgroundColor: '#4a90e2',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4a90e2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    marginTop: 8,
    textAlign: 'center',
  },
  deleteAction: {
    backgroundColor: '#ff4d4d',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '90%',
    minWidth: 44,
    minHeight: 44,
    marginVertical: 7,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  modalContentDark: {
    backgroundColor: '#23242a',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 18,
    color: '#222',
    textAlign: 'center',
  },
  modalTitleDark: {
    color: '#fff',
  },
  modalInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 18,
    color: '#222',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  modalInputDark: {
    backgroundColor: '#181a20',
    color: '#fff',
    borderColor: '#333',
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    marginLeft: 10,
  },
  modalCancelButton: {
    backgroundColor: '#eee',
  },
  modalSaveButton: {
    backgroundColor: '#4a90e2',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  modalSaveButtonText: {
    color: '#fff',
  },
});
