import SwiftUI

struct AssignmentRowView: View {
    let assignment: Assignment

    private var isOverdue: Bool {
        !assignment.isCompleted && assignment.dueDate < Calendar.current.startOfDay(for: .now)
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: assignment.isCompleted ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(assignment.isCompleted ? .green : .secondary)
                .font(.title3)

            VStack(alignment: .leading, spacing: 4) {
                Text(assignment.title)
                    .font(.headline)
                    .strikethrough(assignment.isCompleted)
                HStack(spacing: 8) {
                    if let subject = assignment.subject {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(SubjectColor.color(for: subject.colorHex))
                                .frame(width: 8, height: 8)
                            Text(subject.name)
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    Text(assignment.dueDate, format: .dateTime.month(.abbreviated).day())
                        .font(.caption)
                        .foregroundStyle(isOverdue ? .red : .secondary)
                }
            }

            Spacer()

            Circle()
                .fill(assignment.priority.color)
                .frame(width: 8, height: 8)
        }
        .padding(.vertical, 4)
    }
}
