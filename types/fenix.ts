export interface FenixSpaceRoom {
  id: string;
  name: string;
}

export interface FenixClassSession {
  title: string;
  course: {
    acronym: string;
    name: string;
  };
  classPeriod: {
    start: string; // "DD/MM/YYYY HH:mm"
    end: string;   // "DD/MM/YYYY HH:mm"
  };
  location?: FenixSpaceRoom[];
}