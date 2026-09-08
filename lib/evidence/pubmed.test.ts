import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPapers, findPapers, searchPubMed } from "./pubmed";

/** Replies in call order, and records every URL that was requested. */
function mockFetch(...replies: ({ body: string; ok?: boolean } | Error)[]) {
  const calls: string[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (target: string) => {
      calls.push(target);
      const reply = replies[i++];
      if (reply instanceof Error) throw reply;
      if (!reply) throw new Error("unexpected extra fetch");
      return { ok: reply.ok ?? true, text: async () => reply.body };
    }),
  );
  return calls;
}

const idlist = (...ids: string[]) => ({ body: JSON.stringify({ esearchresult: { idlist: ids } }) });

const article = (inner: string) => ({
  body: `<PubmedArticleSet><PubmedArticle>${inner}</PubmedArticle></PubmedArticleSet>`,
});

afterEach(() => vi.unstubAllGlobals());

describe("searchPubMed", () => {
  it("returns the PMIDs the term matched, in relevance order", async () => {
    const calls = mockFetch(idlist("39001234", "38007777"));
    expect(await searchPubMed("vitamin b12 deficiency neuropathy")).toEqual(["39001234", "38007777"]);
    expect(calls[0]).toContain("esearch.fcgi");
    expect(calls[0]).toContain("sort=relevance");
  });

  it("does not call NCBI at all for an empty question", async () => {
    const calls = mockFetch();
    expect(await searchPubMed("   ")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("drops the placeholder id NCBI returns for a no-hit search", async () => {
    // An empty idlist has come back as ["0"], which is not a record.
    mockFetch(idlist("0"));
    expect(await searchPubMed("qwertyuiop")).toEqual([]);
  });

  it("degrades to no evidence when NCBI errors, rather than failing the turn", async () => {
    mockFetch({ body: "rate limit", ok: false });
    expect(await searchPubMed("iron deficiency")).toEqual([]);
  });

  it("degrades the same way when the network throws", async () => {
    mockFetch(new Error("ECONNRESET"));
    expect(await searchPubMed("iron deficiency")).toEqual([]);
  });
});

describe("fetchPapers", () => {
  it("extracts the fields a citation needs", async () => {
    mockFetch(
      article(`
        <MedlineCitation><PMID Version="1">39001234</PMID>
          <Article>
            <Journal><Title>The Lancet</Title><JournalIssue><PubDate><Year>2024</Year></PubDate></JournalIssue></Journal>
            <ArticleTitle>Oral versus intramuscular B<sub>12</sub> for deficiency</ArticleTitle>
            <Abstract><AbstractText>Oral was non-inferior.</AbstractText></Abstract>
            <PublicationTypeList>
              <PublicationType UI="D016428">Journal Article</PublicationType>
              <PublicationType UI="D017418">Meta-Analysis</PublicationType>
            </PublicationTypeList>
          </Article>
        </MedlineCitation>
        <PubmedData><ArticleIdList><ArticleId IdType="doi">10.1016/S0140-6736(24)00001-2</ArticleId></ArticleIdList></PubmedData>`),
    );

    const [paper] = await fetchPapers(["39001234"]);
    expect(paper.pmid).toBe("39001234");
    // Inline markup is stripped: the consumer is a prompt, not a renderer.
    expect(paper.title).toBe("Oral versus intramuscular B12 for deficiency");
    expect(paper.abstract).toBe("Oral was non-inferior.");
    expect(paper.journal).toBe("The Lancet");
    expect(paper.year).toBe(2024);
    expect(paper.doi).toBe("10.1016/S0140-6736(24)00001-2");
    expect(paper.url).toBe("https://pubmed.ncbi.nlm.nih.gov/39001234/");
    expect(paper.publicationTypes).toContain("Meta-Analysis");
  });

  it("keeps section labels, so a methods line is not read as a finding", async () => {
    mockFetch(
      article(`<PMID>1</PMID>
        <Abstract>
          <AbstractText Label="METHODS" NlmCategory="METHODS">Double-blind, n=40.</AbstractText>
          <AbstractText Label="CONCLUSIONS" NlmCategory="CONCLUSIONS">No effect was seen.</AbstractText>
        </Abstract>`),
    );
    const [paper] = await fetchPapers(["1"]);
    expect(paper.abstract).toBe("METHODS: Double-blind, n=40.\n\nCONCLUSIONS: No effect was seen.");
  });

  it("decodes entities that would otherwise reach the model as markup", async () => {
    mockFetch(article(`<PMID>2</PMID><ArticleTitle>Fe &amp; B&#x2082; in Crohn&#39;s disease</ArticleTitle>`));
    const [paper] = await fetchPapers(["2"]);
    expect(paper.title).toBe("Fe & B₂ in Crohn's disease");
  });

  it("reads the year out of a MedlineDate range", async () => {
    mockFetch(article(`<PMID>3</PMID><PubDate><MedlineDate>2019 Nov-Dec</MedlineDate></PubDate>`));
    const [paper] = await fetchPapers(["3"]);
    expect(paper.year).toBe(2019);
  });

  it("survives a record with no abstract, no doi and no date", async () => {
    mockFetch(article(`<PMID>4</PMID><ArticleTitle>A letter</ArticleTitle>`));
    const [paper] = await fetchPapers(["4"]);
    expect(paper).toMatchObject({ pmid: "4", abstract: "", doi: null, year: null, publicationTypes: [] });
  });

  it("restores relevance order, which efetch does not preserve", async () => {
    mockFetch({
      body: `<PubmedArticleSet>
        <PubmedArticle><PMID>20</PMID><ArticleTitle>second</ArticleTitle></PubmedArticle>
        <PubmedArticle><PMID>10</PMID><ArticleTitle>first</ArticleTitle></PubmedArticle>
      </PubmedArticleSet>`,
    });
    expect((await fetchPapers(["10", "20"])).map((p) => p.title)).toEqual(["first", "second"]);
  });

  it("ignores anything that is not a PMID instead of putting it in a URL", async () => {
    const calls = mockFetch();
    expect(await fetchPapers(["../../etc/passwd", "9 OR 1=1"])).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("findPapers", () => {
  it("searches then fetches, and asks for nothing when the search is empty", async () => {
    const calls = mockFetch(idlist());
    expect(await findPapers("unmatchable term")).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("returns cited papers for a real clinical question", async () => {
    mockFetch(idlist("77"), article(`<PMID>77</PMID><ArticleTitle>Metformin and B12</ArticleTitle>`));
    const papers = await findPapers("does metformin lower b12");
    expect(papers).toHaveLength(1);
    expect(papers[0].url).toBe("https://pubmed.ncbi.nlm.nih.gov/77/");
  });
});
