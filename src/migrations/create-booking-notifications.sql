-- =====================================================
-- Booking Notifications System
-- Handles age/ticket type validation and notifications
-- =====================================================

-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS booking_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_booking_id BIGINT NOT NULL,
    notification_type TEXT NOT NULL CHECK (notification_type IN ('age_mismatch', 'swap_fixed', 'missing_dob', 'other')),
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_booking_notifications_booking_id ON booking_notifications(activity_booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_notifications_type ON booking_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_booking_notifications_unread ON booking_notifications(is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_booking_notifications_unresolved ON booking_notifications(is_resolved) WHERE is_resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_booking_notifications_created ON booking_notifications(created_at DESC);

-- 2. Create swap log table (for periodic review)
CREATE TABLE IF NOT EXISTS booking_swap_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_booking_id BIGINT NOT NULL,
    participant_id BIGINT NOT NULL,
    original_booked_title TEXT NOT NULL,
    corrected_booked_title TEXT NOT NULL,
    passenger_name TEXT NOT NULL,
    passenger_dob DATE,
    calculated_age INT,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_swap_log_booking_id ON booking_swap_log(activity_booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_swap_log_created ON booking_swap_log(created_at DESC);

-- 3. Create function to parse age range from booked_title
CREATE OR REPLACE FUNCTION parse_age_range(booked_title TEXT)
RETURNS TABLE(min_age INT, max_age INT, is_adult BOOLEAN, skip_validation BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
    title_lower TEXT;
    age_match TEXT[];
BEGIN
    title_lower := LOWER(TRIM(booked_title));

    -- Skip validation for non-age-based categories
    IF title_lower ~ '(persona|people|pasajero|hours|horas)' THEN
        RETURN QUERY SELECT NULL::INT, NULL::INT, NULL::BOOLEAN, TRUE;
        RETURN;
    END IF;

    -- Adult patterns (18+)
    IF title_lower ~ '(^adult|^adulto|adulto \()' THEN
        -- Check for specific range like "Adulto (13 - 99)" or "Adulto (7 - 99)"
        IF title_lower ~ '\((\d+)\s*[-–]\s*(\d+)\)' THEN
            age_match := regexp_match(title_lower, '\((\d+)\s*[-–]\s*(\d+)\)');
            IF age_match IS NOT NULL THEN
                RETURN QUERY SELECT age_match[1]::INT, age_match[2]::INT, TRUE, FALSE;
                RETURN;
            END IF;
        END IF;
        -- Default adult 18+
        RETURN QUERY SELECT 18, 120, TRUE, FALSE;
        RETURN;
    END IF;

    -- Young adult pattern "Joven (13 - 26)"
    IF title_lower ~ 'joven' THEN
        age_match := regexp_match(title_lower, '\((\d+)\s*[-–]\s*(\d+)\)');
        IF age_match IS NOT NULL THEN
            RETURN QUERY SELECT age_match[1]::INT, age_match[2]::INT, FALSE, FALSE;
            RETURN;
        END IF;
    END IF;

    -- Child patterns "X a Y años" or "X to Y years"
    IF title_lower ~ '(\d+)\s*(a|to)\s*(\d+)\s*(años|anos|years)' THEN
        age_match := regexp_match(title_lower, '(\d+)\s*(?:a|to)\s*(\d+)');
        IF age_match IS NOT NULL THEN
            RETURN QUERY SELECT age_match[1]::INT, age_match[2]::INT, FALSE, FALSE;
            RETURN;
        END IF;
    END IF;

    -- "de X a Y anos" pattern
    IF title_lower ~ 'de\s*(\d+)\s*a\s*(\d+)\s*(años|anos)' THEN
        age_match := regexp_match(title_lower, 'de\s*(\d+)\s*a\s*(\d+)');
        IF age_match IS NOT NULL THEN
            RETURN QUERY SELECT age_match[1]::INT, age_match[2]::INT, FALSE, FALSE;
            RETURN;
        END IF;
    END IF;

    -- Child with range "Child (3 to 17)"
    IF title_lower ~ 'child.*\((\d+)\s*to\s*(\d+)\)' THEN
        age_match := regexp_match(title_lower, '\((\d+)\s*to\s*(\d+)\)');
        IF age_match IS NOT NULL THEN
            RETURN QUERY SELECT age_match[1]::INT, age_match[2]::INT, FALSE, FALSE;
            RETURN;
        END IF;
    END IF;

    -- Infant patterns "Infant (0 to 2)"
    IF title_lower ~ 'infant' THEN
        age_match := regexp_match(title_lower, '\((\d+)\s*to\s*(\d+)\)');
        IF age_match IS NOT NULL THEN
            RETURN QUERY SELECT age_match[1]::INT, age_match[2]::INT, FALSE, FALSE;
            RETURN;
        END IF;
        -- Default infant 0-2
        RETURN QUERY SELECT 0, 2, FALSE, FALSE;
        RETURN;
    END IF;

    -- Niño pattern "Niño (8 - 12)"
    IF title_lower ~ 'niño' THEN
        age_match := regexp_match(title_lower, '\((\d+)\s*[-–]\s*(\d+)\)');
        IF age_match IS NOT NULL THEN
            RETURN QUERY SELECT age_match[1]::INT, age_match[2]::INT, FALSE, FALSE;
            RETURN;
        END IF;
    END IF;

    -- "18 - 24 años" pattern
    IF title_lower ~ '^(\d+)\s*[-–]\s*(\d+)\s*(años|anos)' THEN
        age_match := regexp_match(title_lower, '^(\d+)\s*[-–]\s*(\d+)');
        IF age_match IS NOT NULL THEN
            RETURN QUERY SELECT age_match[1]::INT, age_match[2]::INT,
                CASE WHEN age_match[1]::INT >= 18 THEN TRUE ELSE FALSE END, FALSE;
            RETURN;
        END IF;
    END IF;

    -- Generic "Child" without range
    IF title_lower ~ '^child$' THEN
        RETURN QUERY SELECT 0, 17, FALSE, FALSE;
        RETURN;
    END IF;

    -- If no pattern matched, skip validation
    RETURN QUERY SELECT NULL::INT, NULL::INT, NULL::BOOLEAN, TRUE;
END;
$$;

-- 4. Create function to calculate age at booking date
CREATE OR REPLACE FUNCTION calculate_age_at_date(dob DATE, ref_date DATE)
RETURNS INT
LANGUAGE plpgsql
AS $$
BEGIN
    IF dob IS NULL OR ref_date IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN EXTRACT(YEAR FROM age(ref_date, dob))::INT;
END;
$$;

-- 5. Create function to find correct booked_title for an age
CREATE OR REPLACE FUNCTION find_correct_booked_title(
    p_activity_booking_id BIGINT,
    p_age INT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_title TEXT;
    v_min_age INT;
    v_max_age INT;
BEGIN
    -- Find a booked_title from the same booking that matches the age
    FOR v_title, v_min_age, v_max_age IN
        SELECT DISTINCT pcb.booked_title, ar.min_age, ar.max_age
        FROM pricing_category_bookings pcb
        CROSS JOIN LATERAL parse_age_range(pcb.booked_title) ar
        WHERE pcb.activity_booking_id = p_activity_booking_id
        AND ar.skip_validation = FALSE
        AND ar.min_age IS NOT NULL
    LOOP
        IF p_age >= v_min_age AND p_age <= v_max_age THEN
            RETURN v_title;
        END IF;
    END LOOP;

    RETURN NULL;
END;
$$;

-- 6. Create the main validation function
CREATE OR REPLACE FUNCTION validate_booking_ages()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_booking RECORD;
    v_participant RECORD;
    v_age_range RECORD;
    v_actual_age INT;
    v_booking_date DATE;
    v_expected_counts JSONB := '{}';
    v_actual_counts JSONB := '{}';
    v_mismatches JSONB := '[]';
    v_swaps_needed JSONB := '[]';
    v_has_real_mismatch BOOLEAN := FALSE;
    v_swap_target TEXT;
    v_title TEXT;
    v_count INT;
BEGIN
    -- Get booking date from activity_bookings
    SELECT ab.start_date_time::DATE INTO v_booking_date
    FROM activity_bookings ab
    WHERE ab.activity_booking_id = NEW.activity_booking_id;

    IF v_booking_date IS NULL THEN
        v_booking_date := CURRENT_DATE;
    END IF;

    -- Calculate expected counts (from booked_title) and actual counts (from DOB)
    FOR v_participant IN
        SELECT
            pcb.id,
            pcb.pricing_category_booking_id,
            pcb.booked_title,
            pcb.passenger_first_name,
            pcb.passenger_last_name,
            pcb.passenger_date_of_birth
        FROM pricing_category_bookings pcb
        WHERE pcb.activity_booking_id = NEW.activity_booking_id
    LOOP
        -- Get age range for this booked_title
        SELECT * INTO v_age_range FROM parse_age_range(v_participant.booked_title);

        -- Skip if this title should not be validated
        IF v_age_range.skip_validation THEN
            CONTINUE;
        END IF;

        -- Increment expected count for this title
        v_count := COALESCE((v_expected_counts->>v_participant.booked_title)::INT, 0) + 1;
        v_expected_counts := v_expected_counts || jsonb_build_object(v_participant.booked_title, v_count);

        -- Calculate actual age
        v_actual_age := calculate_age_at_date(v_participant.passenger_date_of_birth, v_booking_date);

        IF v_actual_age IS NULL THEN
            -- Missing DOB - can't validate
            CONTINUE;
        END IF;

        -- Check if age matches the booked_title
        IF v_actual_age < v_age_range.min_age OR v_actual_age > v_age_range.max_age THEN
            -- Age doesn't match booked_title
            v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
                'participant_id', v_participant.pricing_category_booking_id,
                'name', v_participant.passenger_first_name || ' ' || v_participant.passenger_last_name,
                'dob', v_participant.passenger_date_of_birth,
                'age', v_actual_age,
                'booked_title', v_participant.booked_title,
                'expected_range', v_age_range.min_age || '-' || v_age_range.max_age
            ));

            -- Find what title this person SHOULD have
            v_swap_target := find_correct_booked_title(NEW.activity_booking_id, v_actual_age);

            IF v_swap_target IS NOT NULL THEN
                v_swaps_needed := v_swaps_needed || jsonb_build_array(jsonb_build_object(
                    'participant_id', v_participant.pricing_category_booking_id,
                    'from_title', v_participant.booked_title,
                    'to_title', v_swap_target,
                    'name', v_participant.passenger_first_name || ' ' || v_participant.passenger_last_name,
                    'age', v_actual_age
                ));
            END IF;
        END IF;

        -- Count actual ages per category (what titles people SHOULD have based on DOB)
        v_swap_target := find_correct_booked_title(NEW.activity_booking_id, v_actual_age);
        IF v_swap_target IS NOT NULL THEN
            v_count := COALESCE((v_actual_counts->>v_swap_target)::INT, 0) + 1;
            v_actual_counts := v_actual_counts || jsonb_build_object(v_swap_target, v_count);
        END IF;
    END LOOP;

    -- Check if counts balance out (meaning it's just a swap)
    v_has_real_mismatch := FALSE;
    FOR v_title IN SELECT jsonb_object_keys(v_expected_counts)
    LOOP
        IF COALESCE((v_expected_counts->>v_title)::INT, 0) != COALESCE((v_actual_counts->>v_title)::INT, 0) THEN
            v_has_real_mismatch := TRUE;
            EXIT;
        END IF;
    END LOOP;

    -- If there are mismatches
    IF jsonb_array_length(v_mismatches) > 0 THEN
        IF v_has_real_mismatch THEN
            -- Real mismatch - create notification
            INSERT INTO booking_notifications (
                activity_booking_id,
                notification_type,
                severity,
                title,
                message,
                details
            ) VALUES (
                NEW.activity_booking_id,
                'age_mismatch',
                'error',
                'Age Mismatch Detected',
                'Participant ages do not match booked ticket types and cannot be auto-fixed.',
                jsonb_build_object(
                    'mismatches', v_mismatches,
                    'expected_counts', v_expected_counts,
                    'actual_counts', v_actual_counts
                )
            )
            ON CONFLICT DO NOTHING;
        ELSE
            -- It's just a swap - fix it and log
            FOR v_participant IN
                SELECT * FROM jsonb_array_elements(v_swaps_needed)
            LOOP
                -- Update the booked_title
                UPDATE pricing_category_bookings
                SET booked_title = v_participant.value->>'to_title'
                WHERE pricing_category_booking_id = (v_participant.value->>'participant_id')::BIGINT;

                -- Log the swap
                INSERT INTO booking_swap_log (
                    activity_booking_id,
                    participant_id,
                    original_booked_title,
                    corrected_booked_title,
                    passenger_name,
                    passenger_dob,
                    calculated_age,
                    reason
                ) VALUES (
                    NEW.activity_booking_id,
                    (v_participant.value->>'participant_id')::BIGINT,
                    v_participant.value->>'from_title',
                    v_participant.value->>'to_title',
                    v_participant.value->>'name',
                    (v_participant.value->>'dob')::DATE,
                    (v_participant.value->>'age')::INT,
                    'Auto-corrected OTA swap'
                );
            END LOOP;

            -- Create info notification for swap
            IF jsonb_array_length(v_swaps_needed) > 0 THEN
                INSERT INTO booking_notifications (
                    activity_booking_id,
                    notification_type,
                    severity,
                    title,
                    message,
                    details,
                    is_resolved
                ) VALUES (
                    NEW.activity_booking_id,
                    'swap_fixed',
                    'info',
                    'Ticket Types Auto-Corrected',
                    'OTA sent ticket types in wrong order. Auto-corrected based on dates of birth.',
                    jsonb_build_object('swaps', v_swaps_needed),
                    TRUE
                )
                ON CONFLICT DO NOTHING;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 7. Create trigger (runs after INSERT on pricing_category_bookings)
-- We use a statement-level trigger to validate the whole booking at once
DROP TRIGGER IF EXISTS trg_validate_booking_ages ON pricing_category_bookings;

CREATE OR REPLACE FUNCTION trigger_validate_booking_ages()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_booking_id BIGINT;
BEGIN
    -- Get the booking ID from the new row
    IF TG_OP = 'INSERT' THEN
        v_booking_id := NEW.activity_booking_id;
    ELSIF TG_OP = 'UPDATE' THEN
        v_booking_id := NEW.activity_booking_id;
    END IF;

    -- Defer validation to avoid recursive triggers
    -- Just mark that this booking needs validation
    PERFORM validate_booking_ages_for_booking(v_booking_id);

    RETURN NEW;
END;
$$;

-- Create a separate function that can be called to validate a specific booking
CREATE OR REPLACE FUNCTION validate_booking_ages_for_booking(p_booking_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_participant RECORD;
    v_age_range RECORD;
    v_actual_age INT;
    v_booking_date DATE;
    v_expected_counts JSONB := '{}';
    v_actual_counts JSONB := '{}';
    v_mismatches JSONB := '[]';
    v_swaps_needed JSONB := '[]';
    v_has_real_mismatch BOOLEAN := FALSE;
    v_swap_target TEXT;
    v_title TEXT;
    v_count INT;
    v_swap RECORD;
BEGIN
    -- Delete any existing unresolved notifications for this booking
    DELETE FROM booking_notifications
    WHERE activity_booking_id = p_booking_id
    AND is_resolved = FALSE;

    -- Get booking date from activity_bookings
    SELECT ab.start_date_time::DATE INTO v_booking_date
    FROM activity_bookings ab
    WHERE ab.activity_booking_id = p_booking_id;

    IF v_booking_date IS NULL THEN
        v_booking_date := CURRENT_DATE;
    END IF;

    -- First pass: collect all participants and their info
    FOR v_participant IN
        SELECT
            pcb.id,
            pcb.pricing_category_booking_id,
            pcb.booked_title,
            pcb.passenger_first_name,
            pcb.passenger_last_name,
            pcb.passenger_date_of_birth
        FROM pricing_category_bookings pcb
        WHERE pcb.activity_booking_id = p_booking_id
    LOOP
        -- Get age range for this booked_title
        SELECT * INTO v_age_range FROM parse_age_range(v_participant.booked_title);

        -- Skip if this title should not be validated
        IF v_age_range.skip_validation THEN
            CONTINUE;
        END IF;

        -- Increment expected count for this title
        v_count := COALESCE((v_expected_counts->>v_participant.booked_title)::INT, 0) + 1;
        v_expected_counts := v_expected_counts || jsonb_build_object(v_participant.booked_title, v_count);

        -- Calculate actual age
        v_actual_age := calculate_age_at_date(v_participant.passenger_date_of_birth, v_booking_date);

        IF v_actual_age IS NULL THEN
            -- Missing DOB - can't validate
            CONTINUE;
        END IF;

        -- Check if age matches the booked_title
        IF v_actual_age < v_age_range.min_age OR v_actual_age > v_age_range.max_age THEN
            -- Age doesn't match booked_title
            v_mismatches := v_mismatches || jsonb_build_array(jsonb_build_object(
                'participant_id', v_participant.pricing_category_booking_id,
                'name', v_participant.passenger_first_name || ' ' || v_participant.passenger_last_name,
                'dob', v_participant.passenger_date_of_birth,
                'age', v_actual_age,
                'booked_title', v_participant.booked_title,
                'expected_range', v_age_range.min_age || '-' || v_age_range.max_age
            ));

            -- Find what title this person SHOULD have
            v_swap_target := find_correct_booked_title(p_booking_id, v_actual_age);

            IF v_swap_target IS NOT NULL AND v_swap_target != v_participant.booked_title THEN
                v_swaps_needed := v_swaps_needed || jsonb_build_array(jsonb_build_object(
                    'participant_id', v_participant.pricing_category_booking_id,
                    'from_title', v_participant.booked_title,
                    'to_title', v_swap_target,
                    'name', v_participant.passenger_first_name || ' ' || v_participant.passenger_last_name,
                    'age', v_actual_age,
                    'dob', v_participant.passenger_date_of_birth
                ));
            END IF;
        END IF;

        -- Count actual ages per category (what titles people SHOULD have based on DOB)
        v_swap_target := find_correct_booked_title(p_booking_id, v_actual_age);
        IF v_swap_target IS NOT NULL THEN
            v_count := COALESCE((v_actual_counts->>v_swap_target)::INT, 0) + 1;
            v_actual_counts := v_actual_counts || jsonb_build_object(v_swap_target, v_count);
        END IF;
    END LOOP;

    -- Check if counts balance out (meaning it's just a swap)
    v_has_real_mismatch := FALSE;
    FOR v_title IN SELECT jsonb_object_keys(v_expected_counts)
    LOOP
        IF COALESCE((v_expected_counts->>v_title)::INT, 0) != COALESCE((v_actual_counts->>v_title)::INT, 0) THEN
            v_has_real_mismatch := TRUE;
            EXIT;
        END IF;
    END LOOP;

    -- If there are mismatches
    IF jsonb_array_length(v_mismatches) > 0 THEN
        IF v_has_real_mismatch THEN
            -- Real mismatch - create notification (do NOT auto-fix)
            INSERT INTO booking_notifications (
                activity_booking_id,
                notification_type,
                severity,
                title,
                message,
                details
            ) VALUES (
                p_booking_id,
                'age_mismatch',
                'error',
                'Age Mismatch Detected',
                'Participant ages do not match booked ticket types and cannot be auto-fixed.',
                jsonb_build_object(
                    'mismatches', v_mismatches,
                    'expected_counts', v_expected_counts,
                    'actual_counts', v_actual_counts
                )
            );
        ELSE
            -- It's just a swap - fix it and log
            FOR v_swap IN SELECT * FROM jsonb_array_elements(v_swaps_needed)
            LOOP
                -- Update the booked_title
                UPDATE pricing_category_bookings
                SET booked_title = v_swap.value->>'to_title'
                WHERE pricing_category_booking_id = (v_swap.value->>'participant_id')::BIGINT;

                -- Log the swap
                INSERT INTO booking_swap_log (
                    activity_booking_id,
                    participant_id,
                    original_booked_title,
                    corrected_booked_title,
                    passenger_name,
                    passenger_dob,
                    calculated_age,
                    reason
                ) VALUES (
                    p_booking_id,
                    (v_swap.value->>'participant_id')::BIGINT,
                    v_swap.value->>'from_title',
                    v_swap.value->>'to_title',
                    v_swap.value->>'name',
                    (v_swap.value->>'dob')::DATE,
                    (v_swap.value->>'age')::INT,
                    'Auto-corrected OTA swap'
                );
            END LOOP;

            -- Create info notification for swap (already resolved)
            IF jsonb_array_length(v_swaps_needed) > 0 THEN
                INSERT INTO booking_notifications (
                    activity_booking_id,
                    notification_type,
                    severity,
                    title,
                    message,
                    details,
                    is_resolved,
                    resolved_at
                ) VALUES (
                    p_booking_id,
                    'swap_fixed',
                    'info',
                    'Ticket Types Auto-Corrected',
                    'OTA sent ticket types in wrong order. Auto-corrected based on dates of birth.',
                    jsonb_build_object('swaps', v_swaps_needed),
                    TRUE,
                    NOW()
                );
            END IF;
        END IF;
    END IF;
END;
$$;

-- 8. Enable RLS
ALTER TABLE booking_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_swap_log ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for admin access
CREATE POLICY "Allow all access to booking_notifications" ON booking_notifications FOR ALL USING (true);
CREATE POLICY "Allow all access to booking_swap_log" ON booking_swap_log FOR ALL USING (true);

-- 9. Create function to get unread notification count
CREATE OR REPLACE FUNCTION get_unread_notification_count()
RETURNS INT
LANGUAGE SQL
AS $$
    SELECT COUNT(*)::INT FROM booking_notifications WHERE is_read = FALSE AND is_resolved = FALSE;
$$;
