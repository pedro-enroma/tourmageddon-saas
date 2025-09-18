import pandas as pd

# Read the CSV file with latin-1 encoding and semicolon separator
file_path = '/Users/pedromartinezsaro/Desktop/tourmageddon-saas/activity_bookings_rows IMPORTED NEW UPDATE.csv'
df = pd.read_csv(file_path, encoding='latin-1', sep=';')

# Show basic info
print("File info:")
print(f"Total rows: {len(df)}")
print(f"Columns: {df.columns.tolist()}")

# Find status column
status_col = None
for col in df.columns:
    if 'status' in col.lower():
        status_col = col
        break

if status_col:
    print(f"\nFound status column: {status_col}")
    print(f"Status values: {df[status_col].value_counts()}")
else:
    print("\nStatus column not found!")

# Check for activity_booking_id
if 'activity_booking_id' in df.columns:
    print(f"\nUnique activity_booking_ids: {df['activity_booking_id'].nunique()}")

    # Generate SQL updates
    print("\n\n-- SQL Updates for status changes")
    print("-- Grouping by status for efficiency\n")

    # Group by status for batch updates
    if status_col:
        for status in df[status_col].unique():
            status_df = df[df[status_col] == status]
            activity_ids = status_df['activity_booking_id'].tolist()

            if len(activity_ids) > 0:
                print(f"\n-- Update {len(activity_ids)} bookings to {status}")

                # Split into batches of 100 for manageable updates
                batch_size = 100
                for i in range(0, len(activity_ids), batch_size):
                    batch = activity_ids[i:i+batch_size]
                    ids_str = ', '.join(str(id) for id in batch)

                    print(f"UPDATE activity_bookings")
                    print(f"SET status = '{status}'")
                    print(f"WHERE activity_booking_id IN ({ids_str});")
                    print()

        # Verification query
        print("\n-- Verification query")
        all_ids = ', '.join(str(id) for id in df['activity_booking_id'].tolist())
        print(f"SELECT status, COUNT(*) as count")
        print(f"FROM activity_bookings")
        print(f"WHERE activity_booking_id IN ({all_ids})")
        print(f"GROUP BY status;")
else:
    print("activity_booking_id column not found!")