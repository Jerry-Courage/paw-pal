import logging
from django.apps import AppConfig

logger = logging.getLogger('nitemind')


class LearningConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'learning'
    verbose_name = 'Learning Paths'

    def ready(self):
        """Ensure learning tables exist with all columns — runs on every server boot."""
        from django.db import connection
        try:
            with connection.cursor() as cursor:
                # Check if table exists
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables
                        WHERE table_name = 'learning_learningpath'
                    )
                """)
                table_exists = cursor.fetchone()[0]

                if not table_exists:
                    cursor.execute("""
                        CREATE TABLE learning_learningpath (
                            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                            title varchar(300) NOT NULL,
                            description text NOT NULL DEFAULT '',
                            subject varchar(200) NOT NULL DEFAULT '',
                            status varchar(20) NOT NULL DEFAULT 'draft',
                            start_date timestamp with time zone NULL,
                            deadline timestamp with time zone NULL,
                            total_xp integer NOT NULL DEFAULT 0,
                            concepts_completed integer NOT NULL DEFAULT 0,
                            total_concepts integer NOT NULL DEFAULT 0,
                            daily_review_goal integer NOT NULL DEFAULT 10,
                            created_at timestamp with time zone NOT NULL DEFAULT now(),
                            updated_at timestamp with time zone NOT NULL DEFAULT now(),
                            user_id integer NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
                        )
                    """)
                    logger.info('[Learning] Created learning_learningpath table')
                else:
                    # Table exists — add any missing columns
                    cursor.execute("""
                        SELECT column_name FROM information_schema.columns
                        WHERE table_name = 'learning_learningpath'
                    """)
                    existing = {row[0] for row in cursor.fetchall()}
                    for col, definition in [
                        ('start_date', 'timestamp with time zone NULL'),
                        ('deadline', 'timestamp with time zone NULL'),
                        ('total_xp', 'integer NOT NULL DEFAULT 0'),
                        ('concepts_completed', 'integer NOT NULL DEFAULT 0'),
                        ('total_concepts', 'integer NOT NULL DEFAULT 0'),
                        ('daily_review_goal', 'integer NOT NULL DEFAULT 10'),
                    ]:
                        if col not in existing:
                            cursor.execute(f'ALTER TABLE learning_learningpath ADD COLUMN {col} {definition}')
                            logger.info(f'[Learning] Added missing column: {col}')

                # Ensure conceptnode table
                cursor.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'learning_conceptnode')")
                if not cursor.fetchone()[0]:
                    cursor.execute("""
                        CREATE TABLE learning_conceptnode (
                            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                            title varchar(300) NOT NULL,
                            description text NOT NULL DEFAULT '',
                            source_page integer NULL,
                            source_section varchar(200) NOT NULL DEFAULT '',
                            order_index integer NOT NULL DEFAULT 0,
                            mastery integer NOT NULL DEFAULT 0,
                            status varchar(20) NOT NULL DEFAULT 'locked',
                            xp_earned integer NOT NULL DEFAULT 0,
                            difficulty varchar(20) NOT NULL DEFAULT 'medium',
                            estimated_minutes integer NOT NULL DEFAULT 15,
                            key_definitions jsonb NOT NULL DEFAULT '[]',
                            summary text NOT NULL DEFAULT '',
                            created_at timestamp with time zone NOT NULL DEFAULT now(),
                            updated_at timestamp with time zone NOT NULL DEFAULT now(),
                            path_id uuid NOT NULL REFERENCES learning_learningpath(id) ON DELETE CASCADE,
                            source_resource_id integer NULL REFERENCES library_resource(id) ON DELETE SET NULL
                        )
                    """)
                    logger.info('[Learning] Created learning_conceptnode table')

                # Ensure conceptreview table
                cursor.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'learning_conceptreview')")
                if not cursor.fetchone()[0]:
                    cursor.execute("""
                        CREATE TABLE learning_conceptreview (
                            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                            ease_factor double precision NOT NULL DEFAULT 2.5,
                            interval_days integer NOT NULL DEFAULT 1,
                            repetitions integer NOT NULL DEFAULT 0,
                            last_reviewed timestamp with time zone NULL,
                            next_review timestamp with time zone NULL,
                            last_score integer NOT NULL DEFAULT 0,
                            total_reviews integer NOT NULL DEFAULT 0,
                            correct_reviews integer NOT NULL DEFAULT 0,
                            created_at timestamp with time zone NOT NULL DEFAULT now(),
                            updated_at timestamp with time zone NOT NULL DEFAULT now(),
                            concept_id uuid NOT NULL REFERENCES learning_conceptnode(id) ON DELETE CASCADE,
                            user_id integer NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
                            UNIQUE(concept_id, user_id)
                        )
                    """)
                    logger.info('[Learning] Created learning_conceptreview table')

        except Exception as e:
            logger.error(f'[Learning] Startup table check failed: {e}')
