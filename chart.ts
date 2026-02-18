import org.apache.kafka.clients.admin.*;
import org.apache.kafka.common.TopicPartition;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

public class KafkaClusterConsumerInspector {

    private final AdminClient admin;

    public KafkaClusterConsumerInspector(AdminClient admin) {
        this.admin = admin;
    }

    public List<GroupTopicInfo> findGroupsConsumingTopic(String topic) {
        try {
            // 1) all groups
            Collection<ConsumerGroupListing> groups =
                    admin.listConsumerGroups().all().get();

            List<GroupTopicInfo> result = new ArrayList<>();

            for (ConsumerGroupListing g : groups) {
                String groupId = g.groupId();

                // 2) offsets for group
                Map<TopicPartition, OffsetAndMetadata> offsets =
                        admin.listConsumerGroupOffsets(groupId).partitionsToOffsetAndMetadata().get();

                // filter to topic
                Map<TopicPartition, OffsetAndMetadata> topicOffsets = offsets.entrySet().stream()
                        .filter(e -> e.getKey().topic().equals(topic))
                        .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

                if (topicOffsets.isEmpty()) continue;

                // 3) end offsets (for lag)
                Map<TopicPartition, OffsetSpec> endReq = new HashMap<>();
                for (TopicPartition tp : topicOffsets.keySet()) {
                    endReq.put(tp, OffsetSpec.latest());
                }

                Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> ends =
                        admin.listOffsets(endReq).all().get();

                long totalLag = 0L;
                List<PartitionLag> partitionLags = new ArrayList<>();

                for (var e : topicOffsets.entrySet()) {
                    TopicPartition tp = e.getKey();
                    long committed = e.getValue().offset();
                    long end = ends.get(tp).offset();
                    long lag = Math.max(0, end - committed);
                    totalLag += lag;
                    partitionLags.add(new PartitionLag(tp.partition(), committed, end, lag));
                }

                // 4) members (optional, best-effort)
                ConsumerGroupDescription desc =
                        admin.describeConsumerGroups(List.of(groupId)).all().get().get(groupId);

                List<MemberInfo> members = desc.members().stream()
                        .map(m -> new MemberInfo(m.clientId(), m.host(), m.memberId()))
                        .toList();

                result.add(new GroupTopicInfo(groupId, members, partitionLags, totalLag));
            }

            return result;

        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Interrupted while querying Kafka", ie);
        } catch (ExecutionException ee) {
            throw new RuntimeException("Kafka Admin call failed", ee);
        }
    }

    public record GroupTopicInfo(
            String groupId,
            List<MemberInfo> members,
            List<PartitionLag> partitions,
            long totalLag
    ) {}

    public record MemberInfo(String clientId, String host, String memberId) {}

    public record PartitionLag(int partition, long committedOffset, long endOffset, long lag) {}
}