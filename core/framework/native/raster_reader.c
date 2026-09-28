#define _CRT_SECURE_NO_WARNINGS 1

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <fcntl.h>
#include <io.h>
#include <windows.h>
#include <omp.h>

#define DEFAULT_RASTER_WIDTH 4320
#define DEFAULT_RASTER_HEIGHT 2160

static const char* AGE_COHORTS[18] = {
    "00", "01", "05", "10", "15", "20", "25", "30", "35",
    "40", "45", "50", "55", "60", "65", "70", "75", "80"
};

static const char* SECTOR_KEYS[5] = {
    "agriculture", "informal_labour", "manufacturing", "services", "not_in_work"
};

typedef struct {
    int row;
    int c_start;
    int c_end;
} ScanlineSpan;

typedef struct {
    HANDLE hFile;
    HANDLE hMapping;
    void* base_ptr;
    const float* data;
    int width;
    int height;
} MappedBmp;

static MappedBmp map_bmp_file(const char* filepath) {
    MappedBmp mb;
    mb.hFile = INVALID_HANDLE_VALUE;
    mb.hMapping = NULL;
    mb.base_ptr = NULL;
    mb.data = NULL;
    mb.width = 0;
    mb.height = 0;

    mb.hFile = CreateFileA(
        filepath,
        GENERIC_READ,
        FILE_SHARE_READ,
        NULL,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL | FILE_FLAG_SEQUENTIAL_SCAN,
        NULL
    );
    if (mb.hFile == INVALID_HANDLE_VALUE) {
        return mb;
    }

    mb.hMapping = CreateFileMappingA(mb.hFile, NULL, PAGE_READONLY, 0, 0, NULL);
    if (!mb.hMapping) {
        CloseHandle(mb.hFile);
        mb.hFile = INVALID_HANDLE_VALUE;
        return mb;
    }

    mb.base_ptr = MapViewOfFile(mb.hMapping, FILE_MAP_READ, 0, 0, 0);
    if (!mb.base_ptr) {
        CloseHandle(mb.hMapping);
        CloseHandle(mb.hFile);
        mb.hFile = INVALID_HANDLE_VALUE;
        return mb;
    }

    const unsigned char* bytes = (const unsigned char*)mb.base_ptr;
    if (bytes[0] != 'B' || bytes[1] != 'M') {
        UnmapViewOfFile(mb.base_ptr);
        CloseHandle(mb.hMapping);
        CloseHandle(mb.hFile);
        mb.hFile = INVALID_HANDLE_VALUE;
        mb.base_ptr = NULL;
        return mb;
    }

    unsigned int offset = *(const unsigned int*)(bytes + 10);
    if (offset % 4 != 0) {
        UnmapViewOfFile(mb.base_ptr);
        CloseHandle(mb.hMapping);
        CloseHandle(mb.hFile);
        mb.hFile = INVALID_HANDLE_VALUE;
        mb.base_ptr = NULL;
        return mb;
    }

    mb.data = (const float*)(bytes + offset);
    mb.width = *(const int*)(bytes + 18);
    mb.height = abs(*(const int*)(bytes + 22));
    if (mb.width <= 0) mb.width = DEFAULT_RASTER_WIDTH;
    if (mb.height <= 0) mb.height = DEFAULT_RASTER_HEIGHT;
    return mb;
}

static void unmap_bmp_file(MappedBmp* mb) {
    if (mb && mb->hFile != INVALID_HANDLE_VALUE) {
        if (mb->base_ptr) {
            UnmapViewOfFile(mb->base_ptr);
            mb->base_ptr = NULL;
        }
        if (mb->hMapping) {
            CloseHandle(mb->hMapping);
            mb->hMapping = NULL;
        }
        CloseHandle(mb->hFile);
        mb->hFile = INVALID_HANDLE_VALUE;
        mb->data = NULL;
        mb->width = 0;
        mb->height = 0;
    }
}

static double accumulate_raster(
    const float* data,
    int width,
    int height,
    int is_global,
    const ScanlineSpan* spans,
    int num_spans
) {
    if (!data || width <= 0 || height <= 0) return 0.0;

    double sum = 0.0;

    if (is_global) {
        size_t total_pixels = (size_t)width * (size_t)height;
        for (size_t p = 0; p < total_pixels; p++) {
            float v = data[p];
            if (v > 0.0f && v < 1e12f) {
                sum += (double)v;
            }
        }
        return sum;
    }

    for (int s = 0; s < num_spans; s++) {
        int r = spans[s].row;
        if (r < 0 || r >= height) continue;
        int c_start = spans[s].c_start;
        int c_end = spans[s].c_end;
        if (c_start < 0) c_start = 0;
        if (c_end >= width) c_end = width - 1;
        if (c_start > c_end) continue;

        const float* row_ptr = data + ((size_t)r * width);
        for (int c = c_start; c <= c_end; c++) {
            float v = row_ptr[c];
            if (v > 0.0f && v < 1e12f) {
                sum += (double)v;
            }
        }
    }

    return sum;
}

static double round1(double val) {
    return floor(val * 10.0 + 0.5) / 10.0;
}

int main(int argc, char* argv[]) {
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);

    char mode[32] = "demographics";
    char country[256] = "Global";
    char cache_dir[MAX_PATH] = "data/raster_cache";
    int year = 1950;
    int is_global = 0;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--mode") == 0 && i + 1 < argc) {
            strncpy(mode, argv[++i], sizeof(mode) - 1);
        } else if (strcmp(argv[i], "--country") == 0 && i + 1 < argc) {
            strncpy(country, argv[++i], sizeof(country) - 1);
        } else if (strcmp(argv[i], "--year") == 0 && i + 1 < argc) {
            year = atoi(argv[++i]);
        } else if (strcmp(argv[i], "--cache-dir") == 0 && i + 1 < argc) {
            strncpy(cache_dir, argv[++i], sizeof(cache_dir) - 1);
        } else if (strcmp(argv[i], "--global") == 0) {
            is_global = 1;
        }
    }

    if (_stricmp(country, "Global") == 0 || _stricmp(country, "world") == 0 || strlen(country) == 0) {
        is_global = 1;
    }

    ScanlineSpan* spans = NULL;
    int num_spans = 0;
    int spans_capacity = 0;

    if (!is_global) {
        int magic = getchar();
        if (magic == 'B') {
            int m2 = getchar();
            int m3 = getchar();
            int m4 = getchar();
            if (m2 == 'I' && m3 == 'N' && m4 == 'S') {
                unsigned int count = 0;
                if (fread(&count, sizeof(unsigned int), 1, stdin) == 1 && count > 0) {
                    spans = (ScanlineSpan*)malloc(count * sizeof(ScanlineSpan));
                    if (spans) {
                        size_t read_count = fread(spans, sizeof(ScanlineSpan), count, stdin);
                        num_spans = (int)read_count;
                    }
                }
            }
        } else if (magic != EOF) {
            ungetc(magic, stdin);
            spans_capacity = 2048;
            spans = (ScanlineSpan*)malloc(spans_capacity * sizeof(ScanlineSpan));
            int r, cs, ce;
            while (scanf("%d %d %d", &r, &cs, &ce) == 3) {
                if (num_spans >= spans_capacity) {
                    spans_capacity *= 2;
                    spans = (ScanlineSpan*)realloc(spans, spans_capacity * sizeof(ScanlineSpan));
                }
                spans[num_spans].row = r;
                spans[num_spans].c_start = cs;
                spans[num_spans].c_end = ce;
                num_spans++;
            }
        }
        if (num_spans == 0) {
            is_global = 1;
        }
    }

    if (strcmp(mode, "demographics") == 0 || strcmp(mode, "age_sex") == 0) {
        const int NUM_COHORTS = 18;
        const int TOTAL_RASTERS = 36;
        double sums[36];
        int tid;
        memset(sums, 0, sizeof(sums));

        #pragma omp parallel for num_threads(36) schedule(static)
        for (tid = 0; tid < TOTAL_RASTERS; tid++) {
            char filepath[MAX_PATH];
            if (tid < NUM_COHORTS) {
                snprintf(filepath, sizeof(filepath), "%s/f_%s_%d.bmp", cache_dir, AGE_COHORTS[tid], year);
            } else {
                int mid = tid - NUM_COHORTS;
                snprintf(filepath, sizeof(filepath), "%s/m_%s_%d.bmp", cache_dir, AGE_COHORTS[mid], year);
            }

            MappedBmp mb = map_bmp_file(filepath);
            if (mb.data) {
                sums[tid] = accumulate_raster(mb.data, mb.width, mb.height, is_global, spans, num_spans);
                unmap_bmp_file(&mb);
            }
        }

        double total_female = 0.0;
        double total_male = 0.0;
        double youth_count = 0.0;
        double old_count = 0.0;
        double working_count = 0.0;

        double f_thousands[18];
        double m_thousands[18];

        for (int i = 0; i < NUM_COHORTS; i++) {
            f_thousands[i] = round1(sums[i] / 1000.0);
            m_thousands[i] = round1(sums[NUM_COHORTS + i] / 1000.0);

            total_female += f_thousands[i];
            total_male += m_thousands[i];

            double cohort_tot = f_thousands[i] + m_thousands[i];
            if (i <= 3) {
                youth_count += cohort_tot;
            } else if (i >= 14) {
                old_count += cohort_tot;
            } else {
                working_count += cohort_tot;
            }
        }

        total_female = round1(total_female);
        total_male = round1(total_male);
        double total_pop = youth_count + working_count + old_count;
        double sex_ratio = total_female > 0.0 ? round1((total_male / total_female) * 1000.0) / 1000.0 : 1.0;
        double old_age_dependency_ratio = working_count > 0.0 ? round1((old_count / working_count) * 1000.0) / 10.0 : 15.0;

        printf("{\n");
        printf("  \"country\": \"%s\",\n", is_global ? "Global" : country);
        printf("  \"dependencyRatio\": %.1f,\n", old_age_dependency_ratio);
        printf("  \"oldAgeDependencyRatio\": %.1f,\n", old_age_dependency_ratio);
        printf("  \"female\": {");
        for (int i = 0; i < NUM_COHORTS; i++) {
            printf("\"%s\":%.1f%s", AGE_COHORTS[i], f_thousands[i], (i < NUM_COHORTS - 1) ? "," : "");
        }
        printf("},\n");
        printf("  \"layer\": \"age_sex\",\n");
        printf("  \"male\": {");
        for (int i = 0; i < NUM_COHORTS; i++) {
            printf("\"%s\":%.1f%s", AGE_COHORTS[i], m_thousands[i], (i < NUM_COHORTS - 1) ? "," : "");
        }
        printf("},\n");
        printf("  \"sexRatio\": %.3f,\n", sex_ratio);
        printf("  \"totalFemale\": %.1f,\n", total_female);
        printf("  \"totalMale\": %.1f,\n", total_male);
        printf("  \"year\": %d\n", year);
        printf("}\n");

    } else if (strcmp(mode, "sectors") == 0 || strcmp(mode, "professions") == 0) {
        const int NUM_SECTORS = 5;
        double sums[5];
        int tid;
        memset(sums, 0, sizeof(sums));

        #pragma omp parallel for num_threads(5) schedule(static)
        for (tid = 0; tid < NUM_SECTORS; tid++) {
            char filepath[MAX_PATH];
            snprintf(filepath, sizeof(filepath), "%s/%s_t_%d.bmp", cache_dir, SECTOR_KEYS[tid], year);

            MappedBmp mb = map_bmp_file(filepath);
            if (mb.data) {
                sums[tid] = accumulate_raster(mb.data, mb.width, mb.height, is_global, spans, num_spans);
                unmap_bmp_file(&mb);
            }
        }

        double active_workforce = sums[0] + sums[1] + sums[2] + sums[3];
        double shares[5];
        for (int i = 0; i < 4; i++) {
            shares[i] = active_workforce > 0.0 ? round1((sums[i] / active_workforce) * 1000.0) / 10.0 : 25.0;
        }
        double not_in_work_denom = active_workforce + sums[4];
        shares[4] = not_in_work_denom > 0.0 ? round1((sums[4] / not_in_work_denom) * 1000.0) / 10.0 : 0.0;

        printf("{\n");
        printf("  \"country\": \"%s\",\n", is_global ? "Global" : country);
        printf("  \"layer\": \"professions_percentage\",\n");
        printf("  \"sectors\": {\n");
        for (int i = 0; i < NUM_SECTORS; i++) {
            printf("    \"%s\": %.1f%s\n", SECTOR_KEYS[i], shares[i], (i < NUM_SECTORS - 1) ? "," : "");
        }
        printf("  },\n");
        printf("  \"year\": %d\n", year);
        printf("}\n");
    }

    if (spans) {
        free(spans);
    }
    return 0;
}
