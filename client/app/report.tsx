import { View, StyleSheet, TouchableOpacity } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList, IconName } from "@/types";

type ReportScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "report"
>;

export default function ReportScreen() {
  const navigation = useNavigation<ReportScreenNavigationProp>();

  const options: {
    title: string;
    description: string;
    icon: IconName;
    onPress: () => void;
  }[] = [
    {
      title: "Register Report",
      description: "Submit a new pothole report.",
      icon: "create-outline" as IconName,
      onPress: () => {
        navigation.navigate("registerReport");
      },
    },
    {
      title: "Report Status",
      description: "Check the status of your reported potholes.",
      icon: "document-text-outline" as IconName,
      onPress: () => {
        navigation.navigate("reportHistory");
      },
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header with Gradient */}
      <LinearGradient colors={["#2D8CFF", "#0044CC"]} style={styles.header}>
        <ThemedText type="title" style={styles.headerText}>
          📝 Report Pothole
        </ThemedText>
      </LinearGradient>

      {/* Cards Container */}
      <View style={styles.cardContainer}>
        {options.map((option, index) => (
          <TouchableOpacity
            key={index}
            style={styles.card}
            activeOpacity={0.8}
            onPress={option.onPress}
          >
            <View style={styles.iconWrapper}>
              <Ionicons name={option.icon} size={36} color="#2D8CFF" />
            </View>
            <ThemedText type="title" style={styles.cardTitle}>
              {option.title}
            </ThemedText>
            <ThemedText style={styles.cardDesc}>
              {option.description}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F4F8",
  },
  header: {
    paddingTop: 45,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 6,
  },
  headerText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFF",
  },
  cardContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    padding: 15,
  },
  card: {
    width: "100%",
    height: 180,
    padding: 16,
    marginVertical: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  iconWrapper: {
    width: 55,
    height: 55,
    borderRadius: 55 / 2,
    backgroundColor: "#E3F2FD",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  cardDesc: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 5,
    color: "#555",
  },
});
