from django.db import migrations


def reconcile_journey_schema(apps, schema_editor):
    """Repair databases created by the legacy 0002 table-level fallback.

    That fallback could create ConceptNode without Django's automatic
    prerequisites join table. It could also leave 0003 fields/tables absent
    when migration records and physical schema drifted apart.
    """
    connection = schema_editor.connection
    LearningPath = apps.get_model('learning', 'LearningPath')
    Unit = apps.get_model('learning', 'Unit')
    ConceptNode = apps.get_model('learning', 'ConceptNode')

    def tables():
        return set(connection.introspection.table_names())

    def columns(table_name):
        with connection.cursor() as cursor:
            return {
                column.name
                for column in connection.introspection.get_table_description(cursor, table_name)
            }

    existing_tables = tables()
    path_table = LearningPath._meta.db_table
    unit_table = Unit._meta.db_table
    concept_table = ConceptNode._meta.db_table

    if path_table in existing_tables:
        path_columns = columns(path_table)
        for field_name in ('goal', 'depth'):
            field = LearningPath._meta.get_field(field_name)
            if field.column not in path_columns:
                schema_editor.add_field(LearningPath, field)

    if unit_table not in existing_tables:
        schema_editor.create_model(Unit)

    if concept_table in tables():
        concept_columns = columns(concept_table)
        unit_field = ConceptNode._meta.get_field('unit')
        if unit_field.column not in concept_columns:
            schema_editor.add_field(ConceptNode, unit_field)

        prerequisites = ConceptNode._meta.get_field('prerequisites')
        through = prerequisites.remote_field.through
        if through._meta.db_table not in tables():
            schema_editor.create_model(through)


class Migration(migrations.Migration):
    dependencies = [('learning', '0003_add_unit_and_depth')]

    operations = [
        migrations.RunPython(reconcile_journey_schema, migrations.RunPython.noop),
    ]
